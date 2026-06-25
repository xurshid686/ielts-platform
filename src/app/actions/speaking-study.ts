"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateSpeakingStudy, GeminiKeyMissing } from "@/lib/ai/gemini";
import type { SpeakingQuestion, SpeakingStudy } from "@/types/database";

export type StudyResult =
  | { ok: true; study: SpeakingStudy }
  | { ok: false; error: string };

/**
 * Return the cached practice material for a topic, generating + caching it on
 * first request. The cache is shared across all users (the content is not
 * user-specific), so each topic is only ever generated once.
 */
export async function getOrCreateSpeakingStudy(questionId: string): Promise<StudyResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You are not signed in." };

  const { data, error } = await supabase
    .from("speaking_questions")
    .select("id, part, title, content, study")
    .eq("id", questionId)
    .single();

  if (error || !data) return { ok: false, error: "Topic not found." };
  const q = data as Pick<SpeakingQuestion, "id" | "part" | "title" | "content" | "study">;

  if (q.study) return { ok: true, study: q.study };

  let study: SpeakingStudy;
  try {
    study = await generateSpeakingStudy(q.part, q.title, q.content);
  } catch (e) {
    if (e instanceof GeminiKeyMissing) {
      return { ok: false, error: "AI is not configured (missing GEMINI_API_KEY)." };
    }
    return {
      ok: false,
      error: "Couldn't generate practice material right now. Please try again.",
    };
  }

  // Cache it for everyone (service role bypasses RLS for the write).
  const admin = createAdminClient();
  await admin.from("speaking_questions").update({ study }).eq("id", q.id);

  return { ok: true, study };
}
