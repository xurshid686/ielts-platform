import { NextResponse } from "next/server";
import { secretsMatch } from "@/lib/telegram/auth";
import {
  buildDaily,
  dailyRecipients,
  disableDailyForUser,
  loadReadingCatalogue,
  markDailySent,
  tashkentDay,
} from "@/lib/student-bot";
import { sendStudentText, studentBotConfigured } from "@/lib/telegram/student-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return secretsMatch(req.headers.get("authorization") ?? "", `Bearer ${secret}`);
}

// Daily at 05:00 UTC (10:00 Tashkent), vercel.json. One test per linked
// student with the daily push on. `last_daily` makes a second run on the same
// day send nothing. ?dry=1 builds every message and sends none.
export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!studentBotConfigured()) return NextResponse.json({ ok: true, configured: false });
  const dry = new URL(req.url).searchParams.get("dry") === "1";
  const started = Date.now();
  const day = tashkentDay();
  const catalogue = await loadReadingCatalogue();
  const out = { recipients: 0, sent: 0, skipped: 0, blocked: 0, failed: 0, nothing: 0, dry };

  for (const r of await dailyRecipients()) {
    out.recipients++;
    if (r.last_daily === day) {
      out.skipped++;
      continue;
    }
    if (Date.now() - started > 240_000) break; // stay inside maxDuration
    const msg = await buildDaily(r.user_id, catalogue);
    if (!msg) {
      out.nothing++;
      continue;
    }
    if (dry) {
      out.sent++;
      continue;
    }
    const res = await sendStudentText(r.chat_id, msg.text, { label: "Start the test", href: msg.url });
    if (res.ok) {
      out.sent++;
      await markDailySent(r.user_id, day);
    } else if (res.code === 403) {
      // The student blocked the bot: stop rather than retry forever.
      out.blocked++;
      await disableDailyForUser(r.user_id);
    } else {
      out.failed++;
    }
    await new Promise((s) => setTimeout(s, 50)); // ~20 msg/s, under Telegram's 30/s
  }
  return NextResponse.json({ ok: true, ...out });
}
