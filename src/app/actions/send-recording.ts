"use server";

import { requireProfile } from "@/lib/auth";
import type { Skill } from "@/types/database";

export type SendResult = { ok: true } | { ok: false; error: string };

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB — Telegram bot upload limit
const TG_TEXT_LIMIT = 4096; // Telegram sendMessage hard limit

const SKILL_EMOJI: Record<Skill, string> = {
  reading: "📖",
  listening: "🎧",
  writing: "✍️",
  speaking: "🎙",
};

/** Token/chat config + a friendly student label, gated on My-student status. */
async function teacherChannel() {
  const profile = await requireProfile();
  if (!profile.is_my_student) {
    return { ok: false as const, error: "This feature isn't enabled for your account." };
  }
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TEACHER_CHAT_ID;
  if (!token || !chatId) {
    return { ok: false as const, error: "Teacher delivery isn't configured yet." };
  }
  const student = profile.name || profile.email || "A student";
  return { ok: true as const, token, chatId, student };
}

async function tgSendMessage(token: string, chatId: string, text: string): Promise<boolean> {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: text.slice(0, TG_TEXT_LIMIT) }),
  });
  return res.ok;
}

/**
 * Send a My-student's written answers/essay to the teacher via Telegram.
 * Used by Reading/Listening (submitted answers) and Writing (essay text).
 */
export async function sendTextToTeacher(input: {
  skill: Skill;
  title: string;
  prompt?: string;
  band?: number | null;
  raw?: number | null;
  total?: number | null;
  answers?: Record<string, string> | null;
  text?: string | null; // free-form body (e.g. a writing essay)
}): Promise<SendResult> {
  const ch = await teacherChannel();
  if (!ch.ok) return ch;

  const header =
    `${SKILL_EMOJI[input.skill] ?? "📝"} ${input.skill[0].toUpperCase()}${input.skill.slice(1)} answers from ${ch.student}\n` +
    `📌 ${input.title}`;

  const lines: string[] = [header];
  if (input.prompt) lines.push(`❓ ${input.prompt}`);
  if (typeof input.band === "number") {
    const score =
      input.raw != null && input.total != null ? ` (${input.raw}/${input.total})` : "";
    lines.push(`📊 Band ${input.band}${score}`);
  }
  if (input.answers && Object.keys(input.answers).length) {
    const compact = Object.entries(input.answers)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([q, a]) => `${q}. ${a}`)
      .join("\n");
    lines.push("", compact);
  }
  if (input.text && input.text.trim()) {
    lines.push("", input.text.trim());
  }

  // Telegram caps a message at 4096 chars; split into chunks if needed.
  const full = lines.join("\n");
  try {
    if (full.length <= TG_TEXT_LIMIT) {
      const ok = await tgSendMessage(ch.token, ch.chatId, full);
      if (!ok) return { ok: false, error: "Couldn't reach the teacher right now. Please try again." };
      return { ok: true };
    }
    // Long body: send the header first, then the body in pieces.
    for (let i = 0; i < full.length; i += TG_TEXT_LIMIT) {
      const ok = await tgSendMessage(ch.token, ch.chatId, full.slice(i, i + TG_TEXT_LIMIT));
      if (!ok) return { ok: false, error: "Couldn't reach the teacher right now. Please try again." };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Network error while sending. Please try again." };
  }
}

/**
 * Send a My-student's recorded speaking answer to the teacher via Telegram.
 */
export async function sendSpeakingRecording(formData: FormData): Promise<SendResult> {
  const ch = await teacherChannel();
  if (!ch.ok) return ch;
  const { token, chatId, student } = ch;

  const audio = formData.get("audio");
  if (!(audio instanceof File) || audio.size === 0) {
    return { ok: false, error: "No recording was received." };
  }
  if (audio.size > MAX_BYTES) {
    return { ok: false, error: "Recording is too long. Please keep it under ~5 minutes." };
  }

  const topicTitle = String(formData.get("topicTitle") || "").slice(0, 200);
  const prompt = String(formData.get("prompt") || "").slice(0, 400);
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
