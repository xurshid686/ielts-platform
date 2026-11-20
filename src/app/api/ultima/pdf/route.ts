import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { hasTestPdf, linkedChatFor, mintLinkCode, teacherBotUsername } from "@/lib/ultima";
import { buildPdfPayload } from "@/lib/telegram/teacher-router";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/ultima/pdf?test=<uuid> — the "Get a PDF" button's target.
 *
 * Signed-in users only. If their account is already linked to a Telegram chat the redirect carries
 * just the test id; otherwise it carries a fresh single-use code that binds the chat on first
 * contact. Either way the browser ends up in the teacher bot with the right deep link.
 *
 * A GET that writes (the code) is acceptable here: it needs the session cookie, it only creates a
 * 15-minute code for the caller's own account, and a mail scanner has no session to run it with.
 * Whether the account actually holds Ultima is decided by the BOT, not here, so a non-subscriber
 * gets a useful message in Telegram rather than a dead button.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const testId = url.searchParams.get("test") ?? "";
  const bot = teacherBotUsername();
  if (!bot || !UUID_RE.test(testId)) return new NextResponse(null, { status: 404 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const next = `${url.pathname}?test=${encodeURIComponent(testId)}`;
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(next)}`, url.origin));
  }

  if (!(await hasTestPdf(testId))) return new NextResponse(null, { status: 404 });

  const linked = await linkedChatFor(user.id);
  const code = linked ? null : await mintLinkCode(user.id);
  const payload = buildPdfPayload(testId, code);
  return NextResponse.redirect(`https://t.me/${bot}?start=${payload}`);
}
