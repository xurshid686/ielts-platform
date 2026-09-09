"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  submitRequest,
  approveRequest,
  rejectRequest,
  grantCambridge,
  revokeCambridgeById,
  MAX_REQUEST_MESSAGE,
} from "@/lib/cambridge";
import { notifyCambridgeRequest } from "@/lib/telegram/notify";

// Server actions for the Cambridge section (migration 0049).
//
// The rules all live in @/lib/cambridge, which is service-role and
// authorisation-free by design. These are the doors: each one establishes WHO
// is asking, then calls the library. The Telegram bot is the other door, and it
// calls the same library after its own owner check — that is what stops the two
// from drifting.

export type CambridgeActionResult = { ok: true } | { ok: false; error: string };

async function assertAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null, ok: false as const, error: "Not signed in." };

  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if ((data as { role?: string } | null)?.role !== "admin") {
    return { user, ok: false as const, error: "Admins only." };
  }
  return { user, ok: true as const, error: null };
}

function refresh() {
  revalidatePath("/admin/cambridge");
  revalidatePath("/admin");
  revalidatePath("/cambridge");
}

// ------------------------------------------------------------- the student

/**
 * A student asks for access to the Cambridge section.
 *
 * Session-gated, not admin-gated — and the user id comes from the verified
 * session, never from the form, which is why 0049 revokes INSERT on
 * `cambridge_requests` from `authenticated` altogether.
 *
 * The Telegram push runs inside `after()`, the same wrapper saveResult() uses:
 * it fires once the response has shipped, so an unreachable Telegram can
 * neither delay the student's request nor fail it.
 */
export async function requestCambridgeAccess(message: string): Promise<CambridgeActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in to request access." };

  const note = (message ?? "").slice(0, MAX_REQUEST_MESSAGE);
  const res = await submitRequest(user.id, note);
  if (!res.ok) return res;

  const { data: prof } = await supabase
    .from("profiles")
    .select("name, email")
    .eq("id", user.id)
    .maybeSingle();
  const who = (prof as { name?: string | null; email?: string | null } | null) ?? {};

  after(async () => {
    await notifyCambridgeRequest({
      userId: user.id,
      name: who.name ?? null,
      email: who.email ?? user.email ?? null,
      message: note.trim(),
    });
  });

  refresh();
  return { ok: true };
}

// --------------------------------------------------------------- the owner

export async function approveCambridgeRequest(userId: string): Promise<CambridgeActionResult> {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const res = await approveRequest(userId, gate.user.id);
  if (!res.ok) return res;
  refresh();
  return { ok: true };
}

export async function rejectCambridgeRequest(userId: string): Promise<CambridgeActionResult> {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const res = await rejectRequest(userId, gate.user.id);
  if (!res.ok) return res;
  refresh();
  return { ok: true };
}

/** Add a student without waiting for them to ask. */
export async function grantCambridgeByEmail(email: string): Promise<CambridgeActionResult> {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!email.trim()) return { ok: false, error: "Enter an email address." };

  const res = await grantCambridge(email, gate.user.id);
  if (!res.ok) return res;
  refresh();
  return { ok: true };
}

export async function revokeCambridgeAccess(userId: string): Promise<CambridgeActionResult> {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const res = await revokeCambridgeById(userId);
  if (!res.ok) return res;
  refresh();
  return { ok: true };
}
