import "server-only";
import type { StudentCommand } from "@/lib/telegram/student-router";
import { sendStudentText } from "@/lib/telegram/student-api";
import {
  buildDaily,
  consumeStudentLinkCode,
  loadReadingCatalogue,
  setDaily,
  studentForChat,
} from "@/lib/student-bot";
import { SITE_URL } from "@/lib/site";

// The daily-test half of @MockOnlineMaterials_bot (0070). The bot's webhook is
// /api/telegram-teacher; it hands the student commands here and keeps its own
// /start pdf_… flow. One bot, one webhook (owner, 2026-11-23).

export const STUDENT_HELP =
  "📚 <b>Daily test</b>: one IELTS reading test every morning, picked for your weakest question type.\n" +
  "/test - a test right now\n/stop - pause the daily test\n/daily - turn it back on";

/** True when this command belongs to the daily-test feature. */
export function isStudentCommand(cmd: StudentCommand): boolean {
  return cmd.kind === "link" || cmd.kind === "test" || cmd.kind === "stop" || cmd.kind === "daily";
}

export async function handleStudentCommand(chatId: number, cmd: StudentCommand): Promise<void> {
  if (cmd.kind === "link") {
    const userId = await consumeStudentLinkCode(cmd.code, chatId);
    if (!userId) {
      await sendStudentText(
        chatId,
        "That link has expired. Open your dashboard on the site and press <b>Connect Telegram</b> again.",
        { label: "Open my dashboard", href: `${SITE_URL}/dashboard` },
      );
      return;
    }
    await sendStudentText(chatId, `✅ Connected! You'll get one test every morning.\n\n${STUDENT_HELP}`);
    await sendToday(chatId, userId);
    return;
  }

  const userId = await studentForChat(chatId);
  if (!userId) {
    await sendStudentText(
      chatId,
      "Sign in on MockOnline and press <b>Connect Telegram</b> on your dashboard to get a daily test here.",
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
  }
}

async function sendToday(chatId: number, userId: string): Promise<void> {
  const daily = await buildDaily(userId, await loadReadingCatalogue());
  if (!daily) {
    await sendStudentText(
      chatId,
      "You've done every test I can offer right now. New ones are added every week!",
      { label: "Open MockOnline", href: SITE_URL },
    );
    return;
  }
  await sendStudentText(chatId, daily.text, { label: "Start the test", href: daily.url });
}
