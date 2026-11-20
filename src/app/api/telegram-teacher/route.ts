import { NextResponse } from "next/server";

import { SECRET_HEADER, secretsMatch } from "@/lib/telegram/auth";
import { parseStart } from "@/lib/telegram/teacher-router";
import { sendText, sendDocumentById, sendDocumentBytes, escapeHtml } from "@/lib/telegram/teacher-api";
import { answerMessage } from "@/lib/telegram/answers-text";
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
  if (!msg || typeof msg.chat?.id !== "number") return NextResponse.json({ ok: true });

  try {
    await handle(msg.chat.id, msg.text);
  } catch (e) {
    console.error("[telegram-teacher] handler failed", e);
    await sendText(msg.chat.id, "Something went wrong. Please try again in a minute.");
  }
  return NextResponse.json({ ok: true });
}

async function handle(chatId: number, text: string | undefined): Promise<void> {
  const action = parseStart(text);

  if (action.kind === "none") {
    await sendText(
      chatId,
      "Hello! To get a test as a PDF, open the test on the site and press <b>Get a PDF</b>.",
      { label: "Open the site", href: SITE_URL },
    );
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
        await sendText(chatId, "That link has expired. Go back to the test page and press <b>Get a PDF</b> again.");
        return;
      }
    }
  } else {
    userId = await userForChat(chatId);
    if (!userId) {
      await sendText(
        chatId,
        "I don't know which account this chat belongs to yet. Sign in on the site, open the test and press <b>Get a PDF</b>.",
        { label: "Open the site", href: SITE_URL },
      );
      return;
    }
  }

  if (!(await isUltima(userId))) {
    await sendText(
      chatId,
      "PDF downloads are part of the <b>Ultima</b> plan for teachers. Your account is connected, so they will start working here as soon as Ultima is active.",
      { label: "See the plans", href: `${SITE_URL}/premium` },
    );
    return;
  }

  const pdf = await getTestPdf(action.testId);
  if (!pdf) {
    await sendText(chatId, "This test doesn't have a PDF yet. It is being prepared.");
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
    await sendText(chatId, "I couldn't load that PDF right now. Please try again in a minute.");
    return;
  }
  const sent = await sendDocumentBytes(chatId, bytes, filename, caption);
  if (!sent.ok) {
    await sendText(chatId, "I couldn't send the PDF. Please try again in a minute.");
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
