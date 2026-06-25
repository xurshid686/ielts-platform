"use server";

import { requireProfile } from "@/lib/auth";

export type SendResult = { ok: true } | { ok: false; error: string };

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB — Telegram bot upload limit

/**
 * Send a student's recorded speaking answer to the teacher via the Telegram bot.
 * Only available to admin-flagged students (profile.can_send_to_teacher).
 */
export async function sendSpeakingRecording(formData: FormData): Promise<SendResult> {
  const profile = await requireProfile();
  if (!profile.can_send_to_teacher) {
    return { ok: false, error: "This feature isn't enabled for your account." };
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TEACHER_CHAT_ID;
  if (!token || !chatId) {
    return { ok: false, error: "Teacher delivery isn't configured yet." };
  }

  const audio = formData.get("audio");
  if (!(audio instanceof File) || audio.size === 0) {
    return { ok: false, error: "No recording was received." };
  }
  if (audio.size > MAX_BYTES) {
    return { ok: false, error: "Recording is too long. Please keep it under ~5 minutes." };
  }

  const topicTitle = String(formData.get("topicTitle") || "").slice(0, 200);
  const prompt = String(formData.get("prompt") || "").slice(0, 400);
  const student = profile.name || profile.email || "A student";
  const caption =
    `🎙 Speaking answer from ${student}\n` +
    `📌 ${topicTitle}\n` +
    (prompt ? `❓ ${prompt}` : "");

  // MP3 (and other audio) -> sendAudio so it shows as a playable track with a
  // title; raw ogg/opus voice notes fall back to sendVoice.
  const isOgg = audio.type.includes("ogg");
  const method = isOgg ? "sendVoice" : "sendAudio";
  const field = isOgg ? "voice" : "audio";

  const tg = new FormData();
  tg.append("chat_id", chatId);
  tg.append("caption", caption.slice(0, 1024));
  if (!isOgg) {
    tg.append("title", topicTitle.slice(0, 64) || "Speaking answer");
    tg.append("performer", student.slice(0, 64));
  }
  tg.append(field, audio, audio.name || (isOgg ? "answer.ogg" : "answer.mp3"));

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      body: tg,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("Telegram send failed:", res.status, detail.slice(0, 300));
      return { ok: false, error: "Couldn't reach the teacher right now. Please try again." };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Network error while sending. Please try again." };
  }
}
