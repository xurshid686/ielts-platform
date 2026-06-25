"use server";

import { createClient } from "@/lib/supabase/server";

export type CompletionResult =
  | { ok: true; completed: boolean }
  | { ok: false; error: string };

/** Mark a speaking topic as completed (or undo it) for the signed-in student. */
export async function setSpeakingCompletion(
  questionId: string,
  completed: boolean,
): Promise<CompletionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You are not signed in." };

  if (completed) {
    const { error } = await supabase
      .from("speaking_completions")
      .upsert(
        { user_id: user.id, question_id: questionId },
        { onConflict: "user_id,question_id" },
      );
    if (error) return { ok: false, error: "Couldn't save. Please try again." };
    return { ok: true, completed: true };
  }

  const { error } = await supabase
    .from("speaking_completions")
    .delete()
    .eq("user_id", user.id)
    .eq("question_id", questionId);
  if (error) return { ok: false, error: "Couldn't update. Please try again." };
  return { ok: true, completed: false };
}
