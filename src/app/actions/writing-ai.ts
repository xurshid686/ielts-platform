"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCheck, runMockCheck, runPracticeCheck, setCheckVisible, type CheckRow } from "@/lib/writing-ai";
import { deliverCheckPdf } from "@/lib/writing-ai-telegram";
import type { CheckQuota } from "@/lib/writing-ai-shared";

// AI writing checks (Axiom), migration 0063 — the doors.
//
// A student can only reach their OWN attempt, and only as a Premium member:
// checkPracticeWriting() takes the profile from the verified session and the
// library scopes every query to it. The owner's actions re-check the role
// themselves (a server action is reachable by anyone who can guess its id).
//
// Nothing returned to a student mentions where else a result goes — the owner's
// copy is posted from `after()` and is invisible from here.

export type PracticeCheckResult =
  | { ok: true; check: CheckRow; quota: CheckQuota }
  | { ok: false; error: string };

export async function checkPracticeWriting(attemptId: string): Promise<PracticeCheckResult> {
  const profile = await requireProfile();
  const res = await runPracticeCheck(
    { id: profile.id, role: profile.role, premium_until: profile.premium_until, timezone: profile.timezone },
    String(attemptId ?? ""),
  );
  if (!res.ok) return res;
  // Only a check that was just made is posted; reopening an old one must not repeat it.
  if (res.fresh) after(() => deliverCheckPdf(res.check.id));
  revalidatePath("/writing");
  return { ok: true, check: res.check, quota: res.quota };
}

// ----------------------------------------------------------------- the owner

async function gate(needOwner = false) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };
  const { data } = await supabase.from("profiles").select("role, is_owner").eq("id", user.id).single();
  const p = data as { role?: string; is_owner?: boolean } | null;
  if (p?.role !== "admin") return { ok: false as const, error: "Admins only." };
  if (needOwner && !p.is_owner) return { ok: false as const, error: "Only the owner can do this." };
  return { ok: true as const };
}

export type MockCheckResult = { ok: true; check: CheckRow } | { ok: false; error: string };

/** The owner presses "Run AI check" on a mock attempt. Nothing runs automatically. */
export async function runMockAiCheck(mockAttemptId: string): Promise<MockCheckResult> {
  const g = await gate();
  if (!g.ok) return g;
  try {
    const res = await runMockCheck(String(mockAttemptId ?? ""));
    if (!res.ok) return res;
    after(() => deliverCheckPdf(res.check.id));
    revalidatePath(`/admin/mocks/attempts/${mockAttemptId}`);
    return { ok: true, check: res.check };
  } catch (e) {
    console.error("[writing-ai action] runMockAiCheck", e);
    return { ok: false, error: "Something went wrong on the server. Nothing was changed — try again." };
  }
}

/** Switch on/off: may the student read Axiom's comments (never its numbers) after release? */
export async function setMockAiVisible(checkId: string, visible: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const g = await gate();
  if (!g.ok) return g;
  const res = await setCheckVisible(String(checkId ?? ""), !!visible);
  if (!res.ok) return { ok: false, error: "Couldn't change that. Try again." };
  const check = await getCheck(checkId).catch(() => null);
  if (check?.mock_attempt_id) revalidatePath(`/mock/${check.mock_attempt_id}`);
  return { ok: true };
}

/** "Send again" for a check whose PDF never reached the writing group. */
export async function resendCheckPdf(checkId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const g = await gate(true);
  if (!g.ok) return g;
  const res = await deliverCheckPdf(String(checkId ?? ""), { force: true });
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}
