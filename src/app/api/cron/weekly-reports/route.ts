import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWeeklyReportEmail } from "@/lib/email/send";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Generous budget — emails are sent sequentially to stay under provider rate limits.
export const maxDuration = 60;

type Recipient = {
  user_id: string;
  email: string | null;
  name: string | null;
  tests: number;
  avg_band: number | null;
  best_band: number | null;
  report_id: string;
};

// Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is
// set. We require it so the endpoint can't be triggered by anyone else.
function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("cron_weekly_reports");
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const recipients = (data ?? []) as Recipient[];
  let emailed = 0;
  const emailErrors: string[] = [];
  for (const r of recipients) {
    if (!r.email) continue;
    const res = await sendWeeklyReportEmail(r.email, {
      name: r.name,
      tests: r.tests,
      avgBand: r.avg_band,
      bestBand: r.best_band,
    });
    if (res.sent) emailed++;
    else if (res.error) emailErrors.push(`${r.email}: ${res.error}`);
  }

  return NextResponse.json({
    ok: true,
    reportsBuilt: recipients.length,
    emailed,
    // Surface only the first couple of email failures to keep the response small.
    emailErrors: emailErrors.slice(0, 3),
  });
}
