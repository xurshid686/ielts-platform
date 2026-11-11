import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { finalizeExpiredAttempts } from "@/lib/mock-admin";
import {
  formatDay,
  sendReminderPreview,
  sendReminders,
  type ReminderCandidate,
} from "@/lib/reminder-email";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Emails are paced ~600 ms apart; lib/reminder-email.ts stops itself at 240 s.
export const maxDuration = 300;

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

// Runs once a day (vercel.json). Three things, in this order:
//   1. the in-app streak notification (as before),
//   2. the mock backstop (as before),
//   3. reminder EMAILS (0061): Premium expiring, then streak, then never
//      started. That order is the priority when a student qualifies for two:
//      everyone gets at most one email a day.
//
//   ?dry=1            counts who would be emailed; sends and logs nothing.
//                     (The in-app streak notification is still written: that is
//                     what cron_streak_reminders() does, dry or not.)
//   ?preview=<email>  sends one sample of each reminder to that account's
//                     address and does nothing else.
export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);

  const preview = url.searchParams.get("preview");
  if (preview) {
    const res = await sendReminderPreview(preview);
    return NextResponse.json(res, { status: res.ok ? 200 : 400 });
  }
  const dry = url.searchParams.get("dry") === "1";

  const supabase = createAdminClient();
  const { data: streaks, error } = await supabase.rpc("cron_streak_reminders");
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  // Backstop for mock sections abandoned mid-clock (v2.1); the admin pages do it live.
  const mockSectionsClosed = await finalizeExpiredAttempts().catch(() => 0);

  const [{ data: expiring, error: expiringError }, { data: idle, error: idleError }] = await Promise.all([
    supabase.rpc("cron_premium_expiring"),
    supabase.rpc("cron_never_started"),
  ]);
  if (expiringError) console.error("[cron] cron_premium_expiring", expiringError.message);
  if (idleError) console.error("[cron] cron_never_started", idleError.message);

  const candidates: ReminderCandidate[] = [
    ...(expiring ?? []).map((r) => ({
      userId: r.user_id,
      email: r.email,
      name: r.name,
      unsubscribeToken: r.unsubscribe_token,
      payload: {
        kind: "premium_expiring" as const,
        stage: r.stage === "before" ? ("before" as const) : ("after" as const),
        endsOn: formatDay(r.premium_until),
      },
    })),
    ...(streaks ?? [])
      .filter((r) => r.email_reminders && r.email)
      .map((r) => ({
        userId: r.user_id,
        email: r.email,
        name: r.name,
        unsubscribeToken: r.unsubscribe_token,
        payload: { kind: "streak" as const, streak: r.streak },
      })),
    ...(idle ?? []).map((r) => ({
      userId: r.user_id,
      email: r.email,
      name: r.name,
      unsubscribeToken: r.unsubscribe_token,
      payload: { kind: "never_started" as const, day: r.days_since === 1 ? (1 as const) : (3 as const) },
    })),
  ];

  const emails = await sendReminders(candidates, { dry });

  return NextResponse.json({ ok: true, notified: (streaks ?? []).length, mockSectionsClosed, emails });
}
