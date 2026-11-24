"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { normalizeUzPhone } from "@/lib/sms/format";
import { cleanPersonName, sniffPhotoType } from "@/lib/profile-name";
import { AVATAR_MAX_BYTES, avatarPath, avatarStore, avatarUrl, clearAvatar } from "@/lib/avatar";

// Clears the one-time premium congratulations flag once the user has seen it.
// Updating one's own profile is allowed by RLS (profiles_update_self).
export async function dismissPremiumAnnounce(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("profiles").update({ premium_announce: false }).eq("id", user.id);
}

export type SetTargetResult = { ok: true } | { ok: false; error: string };

// Sets (or clears, with null) the user's target band. Allowed bands are
// 1.0–9.0 in 0.5 steps. target_band is a user-owned preference, so this writes
// via the user's own client (RLS profiles_update_self) — no RPC needed.
export async function setTargetBand(band: number | null): Promise<SetTargetResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You are not signed in." };

  let value: number | null = null;
  if (band != null) {
    const v = Math.round(band * 2) / 2; // snap to nearest 0.5
    if (!Number.isFinite(v) || v < 1 || v > 9) {
      return { ok: false, error: "Pick a band between 1.0 and 9.0." };
    }
    value = v;
  }

  const { error } = await supabase
    .from("profiles")
    .update({ target_band: value })
    .eq("id", user.id);
  if (error) {
    console.error("setTargetBand failed", error);
    return { ok: false, error: "Could not save your target. Please try again." };
  }

  revalidatePath("/dashboard");
  return { ok: true };
}

// Store the user's IANA timezone (auto-detected by the browser). Day/week
// boundaries for streaks and weekly reports are computed in this zone. It's a
// user-owned, non-privileged field, so a plain self-update (RLS) is enough.
export async function setTimezone(tz: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  // Basic IANA shape ("Area/Location") or "UTC" — reject anything else.
  if (tz !== "UTC" && !/^[A-Za-z][A-Za-z_+-]*\/[A-Za-z0-9_+\-/]+$/.test(tz)) {
    return { ok: false };
  }
  // The shape alone accepted "Fake/Zone", and one unknown zone makes the
  // reminder crons' `now() at time zone p.timezone` throw for EVERY student.
  // Migration 0075 enforces the same thing in the database.
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
  } catch {
    return { ok: false };
  }

  await supabase.from("profiles").update({ timezone: tz }).eq("id", user.id);
  return { ok: true };
}

export type SetPhoneResult = { ok: true; phone: string | null } | { ok: false; error: string };

// The optional phone for SMS mock results (0071). Uzbek mobiles only, stored
// as 998XXXXXXXXX; empty (or a bare "+998") clears it. User-owned, so a plain
// self-update under profiles_update_self, like target_band.
export async function setPhone(input: string): Promise<SetPhoneResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You are not signed in." };

  const digits = (input ?? "").replace(/\D/g, "");
  const empty = digits === "" || digits === "998";
  const phone = empty ? null : normalizeUzPhone(digits);
  if (!empty && !phone) {
    return { ok: false, error: "Enter 9 digits after +998, or leave it empty." };
  }

  const { error } = await supabase
    .from("profiles")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- phone (0071) is not in the generated types yet
    .update({ phone } as any)
    .eq("id", user.id);
  if (error) {
    console.error("setPhone failed", error);
    return { ok: false, error: "Could not save your phone number. Please try again." };
  }
  return { ok: true, phone };
}

export type ProfileEditResult =
  | { ok: true; name?: string; avatarUrl?: string | null }
  | { ok: false; error: string };

// Edit profile (owner, 2026-11-24): first name + surname, stored as the one
// `profiles.name` ("First Surname") every view, snapshot and email already
// reads. Re-validated here; the dialog's check is only for quick feedback.
export async function updateName(first: string, last: string): Promise<ProfileEditResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You are not signed in." };

  const res = cleanPersonName(first, last);
  if (!res.ok) return res;
  const { error } = await supabase.from("profiles").update({ name: res.name }).eq("id", user.id);
  if (error) return { ok: false, error: "Could not save your name. Please try again." };
  revalidatePath("/", "layout");
  return { ok: true, name: res.name };
}

// The browser crops and resizes to a 256x256 WebP (JPEG on Safari) before
// sending, so anything that is not a small WebP/JPEG is refused, not re-encoded.
export async function uploadAvatar(form: FormData): Promise<ProfileEditResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You are not signed in." };

  const file = form.get("photo");
  if (!(file instanceof Blob)) return { ok: false, error: "Choose a photo first." };
  if (file.size > AVATAR_MAX_BYTES) return { ok: false, error: "That photo is too large. Try another one." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffPhotoType(bytes);
  if (!type) return { ok: false, error: "That file isn't a photo we can use. Try a JPG or PNG." };

  const { error: upErr } = await avatarStore().upload(avatarPath(user.id), bytes, {
    contentType: type,
    upsert: true,
  });
  if (upErr) return { ok: false, error: "Upload failed. Please try again." };

  const url = avatarUrl(user.id);
  const { error } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", user.id);
  if (error) return { ok: false, error: "Could not save your photo. Please try again." };
  revalidatePath("/", "layout");
  return { ok: true, avatarUrl: url };
}

export async function removeMyAvatar(): Promise<ProfileEditResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You are not signed in." };
  const res = await clearAvatar(user.id);
  if (!res.ok) return { ok: false, error: "Could not remove your photo. Please try again." };
  revalidatePath("/", "layout");
  return { ok: true, avatarUrl: null };
}
