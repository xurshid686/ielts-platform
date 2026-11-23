import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { mintStudentLinkCode } from "@/lib/student-bot";
import { studentBotConfigured, studentBotUsername } from "@/lib/telegram/student-api";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

/**
 * "Get a daily test on Telegram": mints a single-use code for the SIGNED-IN
 * user and sends them to the bot with it. The code is the only thing that can
 * bind a chat to an account (0070).
 */
export async function GET() {
  const bot = studentBotUsername();
  if (!bot || !studentBotConfigured()) return NextResponse.redirect(`${SITE_URL}/dashboard`);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${SITE_URL}/login?next=/dashboard`);
  const code = await mintStudentLinkCode(user.id);
  if (!code) return NextResponse.redirect(`${SITE_URL}/dashboard`);
  return NextResponse.redirect(`https://t.me/${bot}?start=link_${code}`);
}
