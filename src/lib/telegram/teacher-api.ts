import "server-only";

// The teacher bot's slice of the Telegram Bot API. A separate file from api.ts because that one is
// bound to TELEGRAM_BOT_TOKEN (the owner's admin bot) and a bot has exactly one webhook.
// Same contract as api.ts: nothing throws; every call returns a result object.

import { with429Retry } from "./retry";
import type { InlineKeyboard } from "./types";

export { escapeHtml } from "./api";

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const API = (process.env.TELEGRAM_API_BASE || "https://api.telegram.org").replace(/\/+$/, "");

function token(): string | null {
  return process.env.TELEGRAM_TEACHER_BOT_TOKEN || null;
}

export function teacherBotConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_TEACHER_BOT_TOKEN && process.env.TELEGRAM_TEACHER_WEBHOOK_SECRET);
}

async function post<T>(method: string, init: { json?: unknown; form?: FormData }): Promise<Result<T>> {
  const t = token();
  if (!t) return { ok: false, error: "TELEGRAM_TEACHER_BOT_TOKEN is not configured." };
  try {
    // Telegram answers 429 + retry_after when a bot sends too fast (about 30 messages a second
    // overall). Wait the time it names and try again instead of failing the teacher's request.
    type Body = { ok?: boolean; result?: T; description?: string; parameters?: { retry_after?: number } };
    const attempt = await with429Retry(async () => {
      const res = await fetch(`${API}/bot${t}/${method}`, {
        method: "POST",
        ...(init.form
          ? { body: init.form }
          : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(init.json) }),
        cache: "no-store",
      });
      const data = (await res.json()) as Body;
      return { status: res.ok && data.ok ? 200 : res.status, retryAfter: data.parameters?.retry_after, data };
    });
    const { status, data } = attempt;
    if (status !== 200) return { ok: false, error: data.description || `Telegram error (HTTP ${status}).` };
    return { ok: true, value: data.result as T };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to reach Telegram." };
  }
}

/** A single link button (the old call shape) or full rows of buttons. */
export type Markup = { label: string; href: string } | InlineKeyboard;

export function replyMarkup(m: Markup | undefined) {
  if (!m) return {};
  const rows = Array.isArray(m) ? m : [[{ text: m.label, url: m.href }]];
  return { reply_markup: { inline_keyboard: rows } };
}

export async function sendText(
  chatId: number,
  text: string,
  markup?: Markup,
  replyTo?: number,
  opts: { effectId?: string } = {},
) {
  const body = {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    ...(replyTo ? { reply_parameters: { message_id: replyTo, allow_sending_without_reply: true } } : {}),
    ...replyMarkup(markup),
  };
  if (opts.effectId) {
    const withEffect = await post<{ message_id: number }>("sendMessage", {
      json: { ...body, message_effect_id: opts.effectId },
    });
    // An effect is decoration: if Telegram refuses it (an id it no longer knows), send the message plain.
    if (withEffect.ok) return withEffect;
  }
  return post<{ message_id: number }>("sendMessage", { json: body });
}

/** Stops the button's loading spinner. Telegram wants this for EVERY callback, answered or not. */
export async function answerCallbackQuery(callbackQueryId: string, text?: string) {
  return post<boolean>("answerCallbackQuery", {
    json: { callback_query_id: callbackQueryId, ...(text ? { text } : {}) },
  });
}

type SentDocument = { message_id: number; document?: { file_id: string } };

/** Send a document Telegram already holds (cached file_id): no upload, no bytes leave our side. */
export async function sendDocumentById(chatId: number, fileId: string, caption?: string) {
  return post<SentDocument>("sendDocument", {
    json: { chat_id: chatId, document: fileId, ...(caption ? { caption, parse_mode: "HTML" } : {}) },
  });
}

/** First send: upload the bytes. The result carries the file_id to cache for next time. */
export async function sendDocumentBytes(chatId: number, data: Uint8Array, filename: string, caption?: string) {
  const form = new FormData();
  form.set("chat_id", String(chatId));
  if (caption) {
    form.set("caption", caption.length > 1024 ? `${caption.slice(0, 1023)}…` : caption);
    form.set("parse_mode", "HTML");
  }
  form.set("document", new Blob([new Uint8Array(data)], { type: "application/pdf" }), filename);
  return post<SentDocument>("sendDocument", { form });
}

type SentAudio = { message_id: number; audio?: { file_id: string } };

/**
 * A listening test's MP3, as a reply under its PDF. `audio` is either a file_id Telegram already
 * holds (no upload) or the public R2 URL, which Telegram fetches itself (up to 50 MB) — so the
 * MP3 never passes through our server. Its cover art is embedded in the file (ID3).
 */
export async function sendAudio(
  chatId: number,
  audio: string,
  opts: { title?: string; performer?: string; caption?: string; replyTo?: number } = {},
) {
  return post<SentAudio>("sendAudio", {
    json: {
      chat_id: chatId,
      audio,
      ...(opts.title ? { title: opts.title } : {}),
      ...(opts.performer ? { performer: opts.performer } : {}),
      ...(opts.caption ? { caption: opts.caption, parse_mode: "HTML" } : {}),
      ...(opts.replyTo
        ? { reply_parameters: { message_id: opts.replyTo, allow_sending_without_reply: true } }
        : {}),
    },
  });
}
