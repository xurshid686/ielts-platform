import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { PASSES_PER_WEEK, TRIAL_DAYS, passWeekStart } from "@/lib/premium";

// Weekly free Premium passes and the one-time 3-day trial (migration 0069).
//
// Service role, and it authorises ITSELF the way writing-practice.ts does:
// every function takes the user id, and callers pass the id from the verified
// session — never one from a request body.
//
// The tables are not in src/types/supabase.ts until `npm run types` is run
// against a database that has 0069 (it needs the owner's access token). Until
// then this module talks to them through an untyped client — the same stopgap
// lib/ultima.ts uses. Delete db() and use createAdminClient() once regenerated.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above
function db(): SupabaseClient<any, any, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createAdminClient() as unknown as SupabaseClient<any, any, any>;
}

export type PassState = {
  /** Passes left this week (0..PASSES_PER_WEEK). */
  left: number;
  /** Every test this account has ever opened with a pass (they stay open). */
  testIds: Set<string>;
};

/** One read: how many passes are left this week and which tests are pass-opened. */
export async function passState(userId: string): Promise<PassState> {
  const { data } = await db()
    .from("premium_passes")
    .select("test_id, week_start")
    .eq("user_id", userId);
  const rows = (data ?? []) as { test_id: string; week_start: string }[];
  const week = passWeekStart();
  const used = rows.filter((r) => r.week_start === week).length;
  return {
    left: Math.max(0, PASSES_PER_WEEK - used),
    testIds: new Set(rows.map((r) => r.test_id)),
  };
}

export async function hasPass(userId: string, testId: string): Promise<boolean> {
  const { data } = await db()
    .from("premium_passes")
    .select("test_id")
    .eq("user_id", userId)
    .eq("test_id", testId)
    .maybeSingle();
  return !!data;
}

export type ClaimOutcome = "ok" | "already" | "limit" | "not_premium" | "error";

export async function claimPass(userId: string, testId: string): Promise<ClaimOutcome> {
  const { data, error } = await db().rpc("claim_premium_pass", {
    p_user: userId,
    p_test: testId,
    p_limit: PASSES_PER_WEEK,
  });
  if (error) return "error";
  const v = String(data);
  return v === "ok" || v === "already" || v === "limit" || v === "not_premium" ? v : "error";
}

/** The trial's end (ISO) if this account ever started one, else null. */
export async function trialEndsAt(userId: string): Promise<string | null> {
  const { data } = await db()
    .from("premium_trials")
    .select("ends_at")
    .eq("user_id", userId)
    .maybeSingle();
  return (data?.ends_at as string | undefined) ?? null;
}

export async function hasActiveTrial(userId: string): Promise<boolean> {
  const end = await trialEndsAt(userId);
  return !!end && new Date(end).getTime() > Date.now();
}

/**
 * May this account be OFFERED the trial? Never had one, never had Premium,
 * not an admin — and, by default, has finished at least one test (the review
 * page and dashboard offer it after a result). The lock screen passes
 * `requireResult: false`: a student who hits a Premium test before finishing
 * anything is offered it there too (owner, 2026-11-24). Still one per account.
 */
export async function trialEligible(
  profile: { id: string; role: string; premium_until: string | null },
  { requireResult = true }: { requireResult?: boolean } = {},
): Promise<boolean> {
  if (profile.role === "admin" || profile.premium_until) return false;
  const client = db();
  const [{ data: trial }, { count }] = await Promise.all([
    client.from("premium_trials").select("user_id").eq("user_id", profile.id).maybeSingle(),
    requireResult
      ? client.from("results").select("id", { count: "exact", head: true }).eq("user_id", profile.id)
      : Promise.resolve({ count: 1 }),
  ]);
  return !trial && (count ?? 0) > 0;
}

/**
 * Start the trial. The primary key makes a second start impossible: the insert
 * of an existing user_id fails and we report "already".
 */
export async function startTrial(userId: string): Promise<{ ok: true; endsAt: string } | { ok: false; reason: "already" | "error" }> {
  const endsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await db().from("premium_trials").insert({ user_id: userId, ends_at: endsAt });
  if (!error) return { ok: true, endsAt };
  return { ok: false, reason: error.code === "23505" ? "already" : "error" };
}
