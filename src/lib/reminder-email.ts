import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { rows } from "@/types/database";
import { emailConfigured, sendReminderEmail, type ReminderEmail } from "@/lib/email/send";
import { DAILY_REMINDER_CAP, planReminders } from "@/lib/email/reminder-plan";

// Reminder emails (migration 0061, owner 2026-11-11). The ONLY door, like
// lib/mock-email.ts is for mock emails:
//
//  - Called by the two cron routes and nothing else. It is authorisation-free;
//    the routes check CRON_SECRET.
//  - One email per student per day. The log row is INSERTED BEFORE the send and
//    `reminder_log` is UNIQUE (user_id, sent_day), so a cron that fires twice,
//    or two crons on one day, cannot email anyone twice: the second insert
//    conflicts and that student is skipped.
//  - Nothing here throws. A provider failure is stamped on the log row.
//  - `dry` plans and counts but writes and sends nothing.
//  - It stops before the function's time limit and reports what was left.

export type ReminderCandidate = {
  userId: string;
  email: string;
  name: string | null;
  unsubscribeToken: string;
  payload: ReminderEmail;
};

export type ReminderSummary = {
  dry: boolean;
  configured: boolean;
  candidates: number;
  byKind: Record<string, number>;
  planned: number;
  sent: number;
  failed: number;
  duplicates: number;
  alreadyToday: number;
  overCap: number;
  outOfTime: number;
};

/** Resend allows ~2 requests a second. */
const PACE_MS = 600;
/** Leave the route time to answer: the cron functions run with maxDuration 300. */
const BUDGET_MS = 240_000;

const today = () => new Date().toISOString().slice(0, 10);

export async function sendReminders(
  candidates: ReminderCandidate[],
  opts: { dry?: boolean } = {},
): Promise<ReminderSummary> {
  const started = Date.now();
  const db = createAdminClient();
  const day = today();

  const byKind: Record<string, number> = {};
  for (const c of candidates) byKind[c.payload.kind] = (byKind[c.payload.kind] ?? 0) + 1;

  const { data: logged, error: logError } = await db
    .from("reminder_log")
    .select("user_id")
    .eq("sent_day", day)
    .limit(1000);
  const already = new Set(rows<{ user_id: string }>(logged).map((r) => r.user_id));
  // If the log cannot be read, plan as if the cap were already spent: sending
  // blind is how a student gets two emails in a day.
  const sentToday = logError ? DAILY_REMINDER_CAP : already.size;
  if (logError) console.error("[reminder-email] log read failed", logError.message);

  const plan = planReminders(candidates, already, sentToday);
  const summary: ReminderSummary = {
    dry: !!opts.dry,
    configured: emailConfigured(),
    candidates: candidates.length,
    byKind,
    planned: plan.send.length,
    sent: 0,
    failed: 0,
    duplicates: plan.duplicates,
    alreadyToday: plan.alreadyToday,
    overCap: plan.overCap,
    outOfTime: 0,
  };
  if (opts.dry || !summary.configured) return summary;

  for (const [i, c] of plan.send.entries()) {
    if (Date.now() - started > BUDGET_MS) {
      summary.outOfTime = plan.send.length - i;
      break;
    }
    if (i > 0) await new Promise((r) => setTimeout(r, PACE_MS));

    // Claim the day first. A conflict (23505) means another run got there.
    const { data: opened, error: openError } = await db
      .from("reminder_log")
      .insert({ user_id: c.userId, kind: c.payload.kind, sent_day: day, to_email: c.email })
      .select("id")
      .single();
    if (openError || !opened) {
      if (openError?.code === "23505") summary.alreadyToday++;
      else {
        summary.failed++;
        console.error("[reminder-email] log insert failed", openError?.message);
      }
      continue;
    }

    const res = await sendReminderEmail(
      c.email,
      { name: c.name, unsubscribeToken: c.unsubscribeToken },
      c.payload,
    );
    if (res.sent) summary.sent++;
    else summary.failed++;

    const { error: closeError } = await db
      .from("reminder_log")
      .update(
        res.sent
          ? { status: "sent", resend_id: res.id ?? null }
          : { status: "failed", error: (res.error ?? "Unknown error").slice(0, 500) },
      )
      .eq("id", (opened as { id: string }).id);
    if (closeError) console.error("[reminder-email] log update failed", closeError.message);
  }
  return summary;
}

/**
 * One sample of each reminder, sent to an EXISTING account's address so the
 * owner can read them in a real inbox before anything goes to students. Logs
 * nothing and spends no student's daily slot. The address must belong to a
 * profile: that keeps this from being usable as an open relay, and it is where
 * the unsubscribe link's token comes from.
 */
export async function sendReminderPreview(
  address: string,
): Promise<{ ok: boolean; error?: string; results?: string[] }> {
  const db = createAdminClient();
  const { data } = await db
    .from("profiles")
    .select("name, email, unsubscribe_token")
    .eq("email", address.trim().toLowerCase())
    .limit(1)
    .maybeSingle();
  const p = data as { name: string | null; email: string | null; unsubscribe_token: string } | null;
  if (!p?.email) return { ok: false, error: "No account has that email address." };
  if (!emailConfigured()) return { ok: false, error: "Email isn't configured (no RESEND_API_KEY)." };

  const inDays = (n: number) => formatDay(new Date(Date.now() + n * 86_400_000).toISOString());
  const samples: ReminderEmail[] = [
    { kind: "streak", streak: 12 },
    { kind: "inactive", everPractised: true },
    { kind: "inactive", everPractised: false },
    { kind: "weekly_report", tests: 4, avgBand: 6.5, bestBand: 7.5, ratingDelta: 24, reportId: "sample" },
    { kind: "premium_expiring", stage: "before", endsOn: inDays(3) },
    { kind: "premium_expiring", stage: "after", endsOn: inDays(-1) },
  ];
  const results: string[] = [];
  for (const [i, s] of samples.entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, PACE_MS));
    const res = await sendReminderEmail(p.email, { name: p.name, unsubscribeToken: p.unsubscribe_token }, s);
    results.push(`${s.kind}: ${res.sent ? "sent" : `failed (${res.error})`}`);
  }
  return { ok: true, results };
}

/** "14 November 2026", in Tashkent time: where nearly every student is. */
export function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Tashkent",
  });
}
