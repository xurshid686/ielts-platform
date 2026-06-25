"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type CompletionResult =
  | { ok: true; completed: boolean }
  | { ok: false; error: string };

/**
 * Mark a speaking topic as completed (or undo it) for the signed-in student.
 * The user id comes from the verified session; the write uses the service-role
 * client so it works regardless of row-level-security configuration.
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

  const admin = createAdminClient();

  if (completed) {
    const { error } = await admin
      .from("speaking_completions")
      .upsert(
        { user_id: user.id, question_id: questionId },
        { onConflict: "user_id,question_id" },
      );
    if (error) {
      console.error("completion upsert failed:", error.message);
      return { ok: false, error: "Couldn't save. Please try again." };
    }
    revalidatePath("/speaking/questions");
    revalidatePath(`/speaking/questions/${questionId}`);
    return { ok: true, completed: true };
  }

  const { error } = await admin
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
