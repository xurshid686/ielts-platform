import "server-only";

// The teacher bot's slice of the Telegram Bot API. A separate file from api.ts because that one is
// bound to TELEGRAM_BOT_TOKEN (the owner's admin bot) and a bot has exactly one webhook.
// Same contract as api.ts: nothing throws; every call returns a result object.

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
    const res = await fetch(`${API}/bot${t}/${method}`, {
      method: "POST",
      ...(init.form
        ? { body: init.form }
        : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(init.json) }),
      cache: "no-store",
    });
    const data = (await res.json()) as { ok?: boolean; result?: T; description?: string };
    if (!res.ok || !data.ok) return { ok: false, error: data.description || `Telegram error (HTTP ${res.status}).` };
    return { ok: true, value: data.result as T };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to reach Telegram." };
  }
}

export async function sendText(
  chatId: number,
  text: string,
  url?: { label: string; href: string },
  replyTo?: number,
) {
  return post<{ message_id: number }>("sendMessage", {
    json: {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      ...(replyTo ? { reply_parameters: { message_id: replyTo, allow_sending_without_reply: true } } : {}),
      ...(url ? { reply_markup: { inline_keyboard: [[{ text: url.label, url: url.href }]] } } : {}),
    },
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
