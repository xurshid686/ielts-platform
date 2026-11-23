import "server-only";

// The daily-test sender (0070). It uses @MockOnlineMaterials_bot — the same bot
// and token as the Ultima PDFs (TELEGRAM_TEACHER_BOT_TOKEN), owner's choice
// 2026-11-23: one bot, one webhook (/api/telegram-teacher), which routes the
// student commands to lib/student-bot-handler.ts. Never the ADMIN bot.
// Same contract as api.ts / teacher-api.ts: nothing throws.

import { with429Retry } from "./retry";

export { escapeHtml } from "./api";

type Result<T> = { ok: true; value: T } | { ok: false; error: string; code?: number };

const API = (process.env.TELEGRAM_API_BASE || "https://api.telegram.org").replace(/\/+$/, "");

export function studentBotConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_TEACHER_BOT_TOKEN && process.env.TELEGRAM_TEACHER_WEBHOOK_SECRET);
}

/** Public username (no @). Unset = no "Get a daily test on Telegram" button anywhere. */
export function studentBotUsername(): string | null {
  const u = (process.env.TEACHER_BOT_USERNAME || process.env.NEXT_PUBLIC_TEACHER_BOT_USERNAME || "").trim();
  return u ? u.replace(/^@/, "") : null;
}

async function call<T>(method: string, json: unknown): Promise<Result<T>> {
  const t = process.env.TELEGRAM_TEACHER_BOT_TOKEN;
  if (!t) return { ok: false, error: "TELEGRAM_TEACHER_BOT_TOKEN is not configured." };
  try {
    type Body = { ok?: boolean; result?: T; description?: string; error_code?: number; parameters?: { retry_after?: number } };
    const { status, data } = await with429Retry(async () => {
      const res = await fetch(`${API}/bot${t}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(json),
        cache: "no-store",
      });
      const data = (await res.json()) as Body;
      return { status: res.ok && data.ok ? 200 : res.status, retryAfter: data.parameters?.retry_after, data };
    });
    if (status !== 200) return { ok: false, error: data.description || `Telegram error (HTTP ${status}).`, code: data.error_code ?? status };
    return { ok: true, value: data.result as T };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to reach Telegram." };
  }
}

/** chatId may be a number (a student) or "@channel" (a channel the bot administers). */
export async function sendStudentText(
  chatId: number | string,
  text: string,
  url?: { label: string; href: string },
) {
  return call<{ message_id: number }>("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: !!url },
    ...(url ? { reply_markup: { inline_keyboard: [[{ text: url.label, url: url.href }]] } } : {}),
  });
}
