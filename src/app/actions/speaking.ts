"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getTopic } from "@/lib/ielts/speaking-prompts";
import {
  gradeSpeaking,
  GeminiKeyMissing,
  type SpeakingAudioPart,
} from "@/lib/ai/gemini";
import type { SpeakingFeedback } from "@/types/database";

export type SubmitSpeakingResult =
  | {
      ok: true;
      band: number | null;
      feedback: SpeakingFeedback | null;
      aiError: string | null; // set when audio saved but AI feedback unavailable
      streak: number;
      xp: number;
    }
  | { ok: false; error: string };

const PARTS = [1, 2, 3] as const;

export async function submitSpeakingMock(
  formData: FormData,
): Promise<SubmitSpeakingResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You are not signed in." };

  const topicId = String(formData.get("topicId") || "");
  const topic = getTopic(topicId);
  if (!topic) return { ok: false, error: "Unknown topic." };

  // Collect the three recorded parts.
  const files: { part: number; file: File }[] = [];
  for (const part of PARTS) {
    const f = formData.get(`part${part}`) as File | null;
    if (!f || f.size === 0)
      return { ok: false, error: `Part ${part} recording is missing.` };
    files.push({ part, file: f });
  }

  const sessionId = crypto.randomUUID();
  const audioPaths: string[] = [];
  const audioParts: SpeakingAudioPart[] = [];

  for (const { part, file } of files) {
    const path = `${user.id}/${sessionId}/part${part}.wav`;
    const { error: upErr } = await supabase.storage
      .from("speaking")
      .upload(path, file, { contentType: "audio/wav", upsert: false });
    if (upErr) return { ok: false, error: `Upload failed: ${upErr.message}` };
    audioPaths.push(path);

    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const questions =
      part === 1
        ? topic.part1
        : part === 2
          ? [topic.part2.cue, ...topic.part2.bullets]
          : topic.part3;
    audioParts.push({ part, questions, mimeType: "audio/wav", base64 });
  }

  // Grade with Gemini. If the key is missing or the API fails, we still save the
  // session (no data loss) and tell the user feedback is unavailable.
  let feedback: SpeakingFeedback | null = null;
  let band: number | null = null;
  let aiError: string | null = null;
  // Daily AI grading cap (cost control).
  const { data: gradeAllowed } = await supabase.rpc("use_ai_quota", {
    p_kind: "speaking_grade",
  });
  try {
    if (gradeAllowed === false) {
      throw new Error("daily AI limit");
    }
    feedback = await gradeSpeaking(topic.title, audioParts);
    band = typeof feedback.overallBand === "number" ? feedback.overallBand : null;
  } catch (e) {
    if (gradeAllowed === false) {
      aiError =
        "You've reached today's AI feedback limit. Your recording was saved — try again tomorrow or go Premium.";
    } else if (e instanceof GeminiKeyMissing) {
      aiError = "AI feedback isn't set up yet — add a GEMINI_API_KEY to enable it. Your recording was saved.";
    } else {
      aiError = "AI feedback couldn't be generated this time. Your recording was saved.";
    }
  }

  const { data: subRow, error: insErr } = await supabase
    .from("speaking_submissions")
    .insert({
      user_id: user.id,
      prompt: topic.title,
      topic: topic.id,
      audio_path: audioPaths[0],
      audio_paths: audioPaths,
      score: band,
      feedback,
    })
    .select("id")
    .single();
  if (insErr) return { ok: false, error: `Saving failed: ${insErr.message}` };

  // Mark any speaking assignment as submitted. Best-effort: a missing RPC
  // (pre-0030) must not break saving the recording.
  try {
    await supabase.rpc("complete_assignments", {
      p_skill: "speaking",
      p_test_id: null,
      p_result_id: null,
      p_speaking_submission_id: (subRow as { id?: string } | null)?.id ?? null,
      p_writing_submission_id: null,
    });
  } catch {
    /* assignments feature not migrated yet — ignore */
  }

  // Speaking counts toward the daily streak / XP just like reading & listening.
  const { data: act } = await supabase.rpc("record_activity", { p_xp: 30 });
  const a = act?.[0];

  revalidatePath("/speaking");
  revalidatePath("/dashboard");

  return {
    ok: true,
    band,
    feedback,
    aiError,
    streak: a?.streak ?? 0,
    xp: a?.xp ?? 0,
  };
}
