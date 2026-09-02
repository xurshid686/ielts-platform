import "server-only";

// Thin wrapper over the Telegram Bot API, modelled on lingua-lab's
// src/lib/telegram.ts. No client library: every Telegram call in this codebase
// and its siblings is a hand-rolled fetch, and one webhook does not justify a
// dependency.
//
// THE RULE HERE: nothing throws. The webhook route must return 200 quickly and
// unconditionally — a thrown error becomes a 500, Telegram retries the update,
// and the retry re-runs work that already happened. Every function returns a
// result object instead.

import type { InlineKeyboard } from "./types";

export type TelegramResult<T = undefined> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const API = "https://api.telegram.org";

function token(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN || null;
}

/** Escape the characters Telegram's HTML parse_mode cares about. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function call<T>(method: string, body: unknown): Promise<TelegramResult<T>> {
  const t = token();
  if (!t) return { ok: false, error: "TELEGRAM_BOT_TOKEN is not configured." };

  try {
    const res = await fetch(`${API}/bot${t}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const data = (await res.json()) as {
      ok?: boolean;
      result?: T;
      description?: string;
    };
    if (!res.ok || !data.ok) {
      return {
        ok: false,
        error: data.description || `Telegram error (HTTP ${res.status}).`,
      };
    }
    return { ok: true, value: data.result as T };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to reach Telegram.",
    };
  }
}

export type SentMessage = { message_id: number };

export async function sendMessage(
  chatId: number,
  text: string,
  keyboard?: InlineKeyboard,
): Promise<TelegramResult<SentMessage>> {
  return call<SentMessage>("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    // Test titles and student names are not links, and a preview card under
    // every message would bury the content on a phone.
    link_preview_options: { is_disabled: true },
    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
  });
}

/**
 * Replace a message in place.
 *
 * Used for menu navigation so the chat does not fill with a new copy of the
 * menu on every tap, and for the upload wizard's progress line.
 */
export async function editMessageText(
  chatId: number,
  messageId: number,
  text: string,
  keyboard?: InlineKeyboard,
): Promise<TelegramResult<unknown>> {
  return call("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
  });
}

/**
 * Clear the loading spinner on a tapped inline button.
 *
 * Telegram spins that button for a few seconds until this is called. Skipping
 * it is not an error, it just looks broken — so it is always fire-and-forget.
 */
export async function answerCallbackQuery(
  id: string,
  text?: string,
): Promise<TelegramResult<unknown>> {
  return call("answerCallbackQuery", {
    callback_query_id: id,
    ...(text ? { text } : {}),
  });
}

type FileInfo = { file_path?: string; file_size?: number };

/** Step 1 of a download: resolve a file_id to a temporary path. */
export async function getFile(fileId: string): Promise<TelegramResult<FileInfo>> {
  return call<FileInfo>("getFile", { file_id: fileId });
}

/**
 * Step 2: fetch the bytes.
 *
 * The link `getFile` returns is valid for about an hour, which is why the
 * upload wizard stores the downloaded HTML rather than the file_id.
 */
export async function downloadFile(filePath: string): Promise<TelegramResult<string>> {
  const t = token();
  if (!t) return { ok: false, error: "TELEGRAM_BOT_TOKEN is not configured." };

  try {
    const res = await fetch(`${API}/file/bot${t}/${filePath}`, { cache: "no-store" });
    if (!res.ok) {
      return { ok: false, error: `Download failed (HTTP ${res.status}).` };
    }
    return { ok: true, value: await res.text() };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to download from Telegram.",
    };
  }
}
