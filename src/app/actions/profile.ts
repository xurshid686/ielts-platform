"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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
  if (error) return { ok: false, error: error.message };

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

  await supabase.from("profiles").update({ timezone: tz }).eq("id", user.id);
  return { ok: true };
}
