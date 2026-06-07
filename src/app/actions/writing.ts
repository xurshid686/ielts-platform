"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getWritingPrompt } from "@/lib/ielts/writing-prompts";
import { gradeWriting } from "@/lib/ai/writing";
import { GeminiKeyMissing } from "@/lib/ai/gemini";
import type { WritingFeedback } from "@/types/database";

export type SubmitWritingResult =
  | {
      ok: true;
      band: number | null;
      feedback: WritingFeedback | null;
      aiError: string | null;
      streak: number;
      xp: number;
    }
  | { ok: false; error: string };

export async function submitWriting(
  promptId: string,
  content: string,
): Promise<SubmitWritingResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You are not signed in." };

  const prompt = getWritingPrompt(promptId);
  if (!prompt) return { ok: false, error: "Unknown writing prompt." };

  const essay = content.trim();
  if (essay.length < 20) return { ok: false, error: "Please write your answer first." };

  // Daily AI grading cap.
  const { data: allowed } = await supabase.rpc("use_ai_quota", { p_kind: "writing_grade" });

  let feedback: WritingFeedback | null = null;
  let band: number | null = null;
  let aiError: string | null = null;
  try {
    if (allowed === false) throw new Error("limit");
    feedback = await gradeWriting(prompt.task, prompt.prompt, essay);
    band = typeof feedback.overallBand === "number" ? feedback.overallBand : null;
  } catch (e) {
    if (allowed === false) {
      aiError = "You've reached today's AI feedback limit. Your writing was saved — try again tomorrow or go Premium.";
    } else if (e instanceof GeminiKeyMissing) {
      aiError = "AI feedback isn't set up yet. Your writing was saved.";
    } else {
      aiError = "AI feedback couldn't be generated this time. Your writing was saved.";
    }
  }

  const { error: insErr } = await supabase.from("writing_submissions").insert({
    user_id: user.id,
    task_type: prompt.task,
    prompt: `${prompt.title}\n\n${prompt.prompt}`,
    content: essay,
    score: band,
    feedback,
    status: "submitted",
  });
  if (insErr) return { ok: false, error: `Saving failed: ${insErr.message}` };

  const { data: act } = await supabase.rpc("record_activity", { p_xp: 30 });
  const a = act?.[0];

  revalidatePath("/writing");
  revalidatePath("/dashboard");
  return { ok: true, band, feedback, aiError, streak: a?.streak ?? 0, xp: a?.xp ?? 0 };
}
