import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendReminders, type ReminderCandidate } from "@/lib/reminder-email";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Emails are paced ~600 ms apart; lib/reminder-email.ts stops itself at 240 s.
export const maxDuration = 300;

// Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is
// set. We require it so the endpoint can't be triggered by anyone else.
function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

// Sunday, one hour BEFORE the daily reminder (vercel.json), on purpose: a
// student gets one email a day, and on Sunday the weekly report should be the
// one that wins over a streak nudge.
//
//   ?dry=1  builds the reports (that is what cron_weekly_reports() does) and
//           counts who would be emailed; sends and logs nothing.
export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const dry = new URL(req.url).searchParams.get("dry") === "1";

  const supabase = createAdminClient();
  // Builds each active user's weekly report and posts the in-app notification.
  const { data, error } = await supabase.rpc("cron_weekly_reports");
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const candidates: ReminderCandidate[] = (data ?? [])
    .filter((r) => r.email_reminders && r.email && r.tests > 0)
    .map((r) => ({
      userId: r.user_id,
      email: r.email,
      name: r.name,
      unsubscribeToken: r.unsubscribe_token,
      payload: {
        kind: "weekly_report" as const,
        tests: r.tests,
        avgBand: r.avg_band != null ? Number(r.avg_band) : null,
        bestBand: r.best_band != null ? Number(r.best_band) : null,
        ratingDelta: r.rating_delta,
        reportId: r.report_id,
      },
    }));

  const emails = await sendReminders(candidates, { dry });

  return NextResponse.json({ ok: true, reportsBuilt: (data ?? []).length, emails });
}
