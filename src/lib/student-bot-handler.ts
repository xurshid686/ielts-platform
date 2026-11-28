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
import {
  EFFECT_CONFETTI,
  copy,
  startTestKeyboard,
  welcomeKeyboard,
  type Lang,
} from "@/lib/telegram/bot-copy";

// The daily-test half of @MockOnlineMaterials_bot (0070). The bot's webhook is
// /api/telegram-teacher; it hands the student commands here and keeps its own
// /start pdf_… flow. One bot, one webhook (owner, 2026-11-23).
// Every word comes from lib/telegram/bot-copy.ts (English + Uzbek).

/** True when this command belongs to the daily-test feature. */
export function isStudentCommand(cmd: StudentCommand): boolean {
  return cmd.kind === "link" || cmd.kind === "test" || cmd.kind === "stop" || cmd.kind === "daily";
}

export async function handleStudentCommand(chatId: number, cmd: StudentCommand, lang: Lang = "en"): Promise<void> {
  const t = copy(lang);
  if (cmd.kind === "link") {
    const userId = await consumeStudentLinkCode(cmd.code, chatId);
    if (!userId) {
      await sendStudentText(chatId, t.linkExpired, { label: t.btn.dashboard, href: `${SITE_URL}/dashboard` });
      return;
    }
    await sendStudentText(chatId, t.connected, undefined, { effectId: EFFECT_CONFETTI });
    await sendToday(chatId, userId, lang);
    return;
  }

  const userId = await studentForChat(chatId);
  if (!userId) {
    await sendStudentText(chatId, t.notLinked, welcomeKeyboard(lang, SITE_URL));
    return;
  }
  if (cmd.kind === "test") return sendToday(chatId, userId, lang);
  if (cmd.kind === "stop") {
    await setDaily(chatId, false);
    await sendStudentText(chatId, t.paused);
    return;
  }
  if (cmd.kind === "daily") {
    await setDaily(chatId, true);
    await sendStudentText(chatId, t.resumed);
  }
}

async function sendToday(chatId: number, userId: string, lang: Lang): Promise<void> {
  const daily = await buildDaily(userId, await loadReadingCatalogue());
  if (!daily) {
    await sendStudentText(chatId, copy(lang).nothingLeft, { label: copy(lang).btn.site, href: SITE_URL });
    return;
  }
  // The suggestion text itself is English (dailyText is shared with the 10:00 cron); the button follows the user.
  await sendStudentText(chatId, daily.text, startTestKeyboard(lang, SITE_URL, daily.path));
}
