"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type CompletionResult =
  | { ok: true; completed: boolean }
  | { ok: false; error: string };

/**
 * Mark a speaking topic as completed (or undo it) for the signed-in student.
 *
 * Uses the SESSION client. `speaking_completions` already has owner-scoped
 * select / insert / delete policies (migration 0028), so RLS is the check —
 * this used to run as the service role "so it works regardless of
 * row-level-security configuration", which is how service-role usage spreads
 * until one hand-written filter is wrong.
 *
 * The insert is ON CONFLICT DO NOTHING (`ignoreDuplicates`) rather than a true
 * upsert: 0028 grants no UPDATE policy, and there is nothing to update anyway
 * — the row existing IS the completion.
 */
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
        { onConflict: "user_id,question_id", ignoreDuplicates: true },
      );
    if (error) {
      console.error("completion upsert failed:", error.message);
      return { ok: false, error: "Couldn't save. Please try again." };
    }
    revalidatePath("/speaking/questions");
    revalidatePath(`/speaking/questions/${questionId}`);
    return { ok: true, completed: true };
  }

  const { error } = await supabase
    .from("speaking_completions")
    .delete()
    .eq("user_id", user.id)
    .eq("question_id", questionId);
  if (error) {
    console.error("completion delete failed:", error.message);
    return { ok: false, error: "Couldn't update. Please try again." };
  }
  revalidatePath("/speaking/questions");
  revalidatePath(`/speaking/questions/${questionId}`);
  return { ok: true, completed: false };
}
