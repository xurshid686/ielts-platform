import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendStreakReminderEmail } from "@/lib/email/send";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

type Recipient = {
  user_id: string;
  email: string | null;
  name: string | null;
  streak: number;
};

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
  // Posts the in-app 'streak_reminder' notification and returns who to email.
  const { data, error } = await supabase.rpc("cron_streak_reminders");
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const recipients = (data ?? []) as Recipient[];
  let emailed = 0;
  const emailErrors: string[] = [];
  for (const r of recipients) {
    if (!r.email) continue;
    const res = await sendStreakReminderEmail(r.email, { name: r.name, streak: r.streak });
    if (res.sent) emailed++;
    else if (res.error) emailErrors.push(`${r.email}: ${res.error}`);
  }

  return NextResponse.json({
    ok: true,
    notified: recipients.length,
    emailed,
    emailErrors: emailErrors.slice(0, 3),
  });
}
