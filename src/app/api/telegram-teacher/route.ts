import { NextResponse, after } from "next/server";

import { SECRET_HEADER, secretsMatch } from "@/lib/telegram/auth";
import { parseStart } from "@/lib/telegram/teacher-router";
import { parseStudentText } from "@/lib/telegram/student-router";
import { handleStudentCommand, isStudentCommand } from "@/lib/student-bot-handler";
import {
  answerCallbackQuery,
  sendText,
  sendDocumentById,
  sendDocumentBytes,
  escapeHtml,
} from "@/lib/telegram/teacher-api";
import { CB, copy, pickLang, welcomeKeyboard, type Lang } from "@/lib/telegram/bot-copy";
import { answerMessage } from "@/lib/telegram/answers-text";
import { createDedupe } from "@/lib/telegram/dedupe";
import type { TelegramUpdate } from "@/lib/telegram/types";
import {
  consumeLinkCode,
  forgetFileId,
  getTestPdf,
  isUltima,
  readPdfBytes,
  rememberFileId,
  userForChat,
} from "@/lib/ultima";
import { createAdminClient } from "@/lib/supabase/admin";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// Telegram redelivers an update it did not get a quick 200 for; a repeat would send a second copy of
// the PDF. In-memory is enough (one app instance, retries within seconds): see lib/telegram/dedupe.ts.
const recentUpdates = createDedupe();

/**
 * The TEACHER bot: sends a reading test's PDF to an Ultima account that has linked its chat.
 * Not the owner's admin bot (/api/telegram) — a bot has one webhook, and that one is owner-only.
 *
 * Same rules as the admin bot:
 *  - a wrong/missing secret is a bare 404 (an auth challenge would confirm the endpoint exists);
 *  - after that gate it ALWAYS answers 200, because Telegram redelivers on anything else and a
 *    redelivered "send the PDF" is only a duplicate message, but a thrown error is worse;
 *  - missing config fails closed.
 *
 * Unlike the admin bot there is no owner gate: strangers are the audience. The security boundary
 * is the account check — a PDF goes only to a chat that was bound to an Ultima account by a
 * single-use code minted for a signed-in user (src/lib/ultima.ts).
 */
export async function POST(req: Request) {
  const expected = process.env.TELEGRAM_TEACHER_WEBHOOK_SECRET;
  const got = req.headers.get(SECRET_HEADER);
  if (!expected || !got || !secretsMatch(got, expected)) {
    return new NextResponse(null, { status: 404 });
  }

  let update: TelegramUpdate;
  try {
    update = (await req.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: true });
  }

  const msg = update.message;
  const cb = update.callback_query;
  // The chat to answer in. A button press carries its message's chat; a press on a message the
  // client can no longer see has none, and in a private chat the user's id is that chat's id.
  const chatId = msg ? msg.chat?.id : (cb?.message?.chat?.id ?? cb?.from?.id);
  if ((!msg && !cb) || typeof chatId !== "number") return NextResponse.json({ ok: true });
  // Private chats only. Every flow here is one person's (their PDFs, their daily test), and
  // Telegram refuses a whole message carrying a web_app button anywhere else.
  const chatType = msg ? msg.chat?.type : cb?.message?.chat?.type;
  if (chatType && chatType !== "private") return NextResponse.json({ ok: true });

  if (typeof update.update_id === "number" && recentUpdates.isRepeat(update.update_id)) {
    return NextResponse.json({ ok: true, deduped: true });
  }

  // Answer Telegram at once and do the work afterwards. Loading a PDF and sending it can take
  // seconds, and a slow 200 is what makes Telegram redeliver the same update. `after()` runs the
  // callback once the response is sent; the handler reports its own failures into the chat.
  const from = msg?.from ?? cb?.from;
  const ctx: Ctx = {
    chatId,
    lang: pickLang(from?.language_code),
    firstName: (from?.first_name ?? "").trim().split(/\s+/)[0] || null,
  };
  after(async () => {
    try {
      if (cb) await handleCallback(cb.id, cb.data, ctx);
      else await handle(ctx, msg?.text);
    } catch (e) {
      console.error("[telegram-teacher] handler failed", e);
      await sendText(chatId, copy(ctx.lang).error);
    }
  });
  return NextResponse.json({ ok: true });
}

type Ctx = { chatId: number; lang: Lang; firstName: string | null };

/** The welcome-keyboard buttons. The spinner is stopped FIRST, whatever happens next. */
async function handleCallback(id: string, data: string | undefined, ctx: Ctx): Promise<void> {
  await answerCallbackQuery(id);
  if (data === CB.test) return handleStudentCommand(ctx.chatId, { kind: "test" }, ctx.lang);
  if (data === CB.help) {
    await sendText(ctx.chatId, copy(ctx.lang).help, welcomeKeyboard(ctx.lang, SITE_URL));
  }
}

async function handle(ctx: Ctx, text: string | undefined): Promise<void> {
  const { chatId, lang } = ctx;
  const t = copy(lang);
  // The same bot also runs the students' daily test (0070): /start link_<code>,
  // /test, /stop, /daily. Its own /start pdf_… flow below is untouched.
  const studentCmd = parseStudentText(text);
  if (isStudentCommand(studentCmd)) {
    await handleStudentCommand(chatId, studentCmd, lang);
    return;
  }

  const action = parseStart(text);

  if (action.kind === "none") {
    const keyboard = welcomeKeyboard(lang, SITE_URL);
    if (studentCmd.kind === "text") await sendText(chatId, t.nudge, keyboard);
    else if (studentCmd.kind === "help") await sendText(chatId, t.help, keyboard);
    else await sendText(chatId, t.welcome(ctx.firstName), keyboard);
    return;
  }

  // Who is this? Either a fresh link code from the site button, or a chat linked earlier.
  let userId: string | null;
  if (action.code) {
    userId = await consumeLinkCode(action.code, chatId);
    if (!userId) {
      // Spent, expired, or forged. A chat that is already linked can still be served.
      userId = await userForChat(chatId);
      if (!userId) {
        await sendText(chatId, t.pdfExpired);
        return;
      }
    }
  } else {
    userId = await userForChat(chatId);
    if (!userId) {
      await sendText(chatId, t.pdfUnlinked, { label: t.btn.site, href: SITE_URL });
      return;
    }
  }

  if (!(await isUltima(userId))) {
    await sendText(chatId, t.pdfNotUltima, { label: t.btn.seeUltima, href: `${SITE_URL}/premium#ultima` });
    return;
  }

  const pdf = await getTestPdf(action.testId);
  if (!pdf) {
    await sendText(chatId, t.pdfNone);
    return;
  }

  const admin = createAdminClient();
  const { data: test } = await admin.from("tests").select("title, answer_key").eq("id", action.testId).maybeSingle();
  const title = test?.title ?? "IELTS Reading";
  const caption = pdf.passage_label
    ? `<b>${escapeHtml(pdf.passage_label)}</b> · ${escapeHtml(title)}`
    : `<b>${escapeHtml(title)}</b>`;
  const filename = `${title.replace(/[^\w\- ]+/g, "").trim().slice(0, 60) || "IELTS Reading"}.pdf`;

  // Cheapest first: a document Telegram already holds costs no upload at all.
  if (pdf.tg_file_id) {
    const sent = await sendDocumentById(chatId, pdf.tg_file_id, caption);
    if (sent.ok) {
      await sendAnswers(chatId, title, pdf.passage_label, test?.answer_key, sent.value.message_id);
      return;
    }
    await forgetFileId(action.testId); // stale id: fall through to a fresh upload
  }

  const bytes = await readPdfBytes(pdf);
  if (!bytes) {
    await sendText(chatId, t.pdfLoadFailed);
    return;
  }
  const sent = await sendDocumentBytes(chatId, bytes, filename, caption);
  if (!sent.ok) {
    await sendText(chatId, t.pdfSendFailed);
    return;
  }
  const fileId = sent.value.document?.file_id;
  if (fileId) await rememberFileId(action.testId, fileId);
  await sendAnswers(chatId, title, pdf.passage_label, test?.answer_key, sent.value.message_id);
}

/**
 * The answers, written but BLURRED (a Telegram spoiler, tap to reveal), as a reply under the PDF.
 * The PDF itself never carries answers. A failure here must not undo a PDF already delivered.
 */
async function sendAnswers(
  chatId: number,
  title: string,
  label: string | null,
  key: unknown,
  replyTo: number,
): Promise<void> {
  const msg = answerMessage(title, (key ?? null) as Record<string, unknown> | null, label);
  if (msg) await sendText(chatId, msg, undefined, replyTo);
}

// Telegram never GETs a webhook, so there is nothing to show here.
export async function GET() {
  return new NextResponse(null, { status: 404 });
}
