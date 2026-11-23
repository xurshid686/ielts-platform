import { NextResponse, after } from "next/server";
import { SECRET_HEADER, secretsMatch } from "@/lib/telegram/auth";
import { createDedupe } from "@/lib/telegram/dedupe";
import { parseStudentText } from "@/lib/telegram/student-router";
import { sendStudentText } from "@/lib/telegram/student-api";
import type { TelegramUpdate } from "@/lib/telegram/types";
import {
  buildDaily,
  consumeStudentLinkCode,
  loadReadingCatalogue,
  setDaily,
  studentForChat,
} from "@/lib/student-bot";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const recent = createDedupe();

/**
 * The STUDENT bot (0070): a linked student gets a recommended test every day,
 * and can ask for one with /test. Strangers are the audience, so there is no
 * owner gate — same shape as /api/telegram-teacher:
 *  - wrong/missing secret -> bare 404;
 *  - after that ALWAYS 200 (Telegram redelivers anything else), work in after();
 *  - missing config fails closed.
 * The boundary is the account binding: a chat is tied to an account only by a
 * single-use code minted for a signed-in user (/api/student-bot/link).
 */
export async function POST(req: Request) {
  const expected = process.env.TELEGRAM_STUDENT_WEBHOOK_SECRET;
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
  // Private chats only: never act on group or channel traffic.
  const chatType = (msg?.chat as { type?: string } | undefined)?.type;
  if (!msg || typeof msg.chat?.id !== "number" || chatType !== "private") {
    return NextResponse.json({ ok: true });
  }
  if (typeof update.update_id === "number" && recent.isRepeat(update.update_id)) {
    return NextResponse.json({ ok: true, deduped: true });
  }
  const chatId = msg.chat.id;
  const text = msg.text;
  after(async () => {
    try {
      await handle(chatId, text);
    } catch (e) {
      console.error("[telegram-student] handler failed", e);
      await sendStudentText(chatId, "Something went wrong. Please try again in a minute.");
    }
  });
  return NextResponse.json({ ok: true });
}

const SITE_BUTTON = { label: "Open MockOnline", href: SITE_URL };
const HELP =
  "I send you one IELTS test a day, picked for your weakest question type.\n\n" +
  "/test - a test right now\n/stop - pause the daily test\n/daily - turn it back on";

async function handle(chatId: number, text: string | undefined): Promise<void> {
  const cmd = parseStudentText(text);

  if (cmd.kind === "link") {
    const userId = await consumeStudentLinkCode(cmd.code, chatId);
    if (!userId) {
      await sendStudentText(
        chatId,
        "That link has expired. Open your dashboard on the site and press <b>Get a daily test on Telegram</b> again.",
        SITE_BUTTON,
      );
      return;
    }
    await sendStudentText(chatId, `✅ Connected! You'll get one test every morning.\n\n${HELP}`);
    await sendToday(chatId, userId);
    return;
  }

  const userId = await studentForChat(chatId);
  if (!userId) {
    await sendStudentText(
      chatId,
      "Hello! Sign in on MockOnline and press <b>Get a daily test on Telegram</b> on your dashboard to connect this chat.",
      { label: "Open my dashboard", href: `${SITE_URL}/dashboard` },
    );
    return;
  }

  if (cmd.kind === "test") return sendToday(chatId, userId);
  if (cmd.kind === "stop") {
    await setDaily(chatId, false);
    await sendStudentText(chatId, "Paused. Send /daily any time to get the daily test again.");
    return;
  }
  if (cmd.kind === "daily") {
    await setDaily(chatId, true);
    await sendStudentText(chatId, "Done. You'll get a test every morning.");
    return;
  }
  await sendStudentText(chatId, HELP);
}

async function sendToday(chatId: number, userId: string): Promise<void> {
  const daily = await buildDaily(userId, await loadReadingCatalogue());
  if (!daily) {
    await sendStudentText(
      chatId,
      "You've done every test I can offer right now. New ones are added every week!",
      SITE_BUTTON,
    );
    return;
  }
  await sendStudentText(chatId, daily.text, { label: "Start the test", href: daily.url });
}
