"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireProfile } from "@/lib/auth";
import {
  createTask1Question,
  createTask2Question,
  savePractice,
  setPracticePublished,
  type SaveResult,
} from "@/lib/writing-practice";

// Writing practice (Task 1, Task 2, Full) — the server actions.
//
// These are the ONLY mutation path, and every one of them starts by reading the
// user from the verified session; the attempt id from the browser is never
// trusted on its own (lib/writing-practice.ts scopes each query to that user).
//
// Nothing here touches the mock's saveMockWriting, /api/mock-draft or
// /api/mock-events. Reusing any of those would quietly bring admission rules,
// a server-enforced deadline or the three-violation auto-submit with it — none
// of which belongs in practice.

/**
 * Autosave and hand-in, both. `revision` is the value the browser last got
 * back; a stale one is refused rather than overwriting newer text.
 *
 * There is no deadline check on purpose: the practice clock is advisory, so a
 * save after 40 minutes is an ordinary save.
 */
export async function savePracticeAnswer(
  attemptId: string,
  answer: string,
  revision: number,
  final: boolean,
  /** Full tests only: the Task 2 answer. */
  answer2?: string | null,
): Promise<SaveResult> {
  const profile = await requireProfile();
  return savePractice(profile.id, attemptId, answer, Math.max(0, Math.floor(revision)), final, answer2 ?? null);
}

/** The owner's "Add Task 1" form: picture + sentence + chart kind, saved unpublished. */
export async function createTask1PracticeAction(formData: FormData) {
  await requireAdmin();
  const file = formData.get("image");
  const res = await createTask1Question({
    prompt: String(formData.get("prompt") ?? ""),
    chart: String(formData.get("chart") ?? ""),
    file: file instanceof File ? file : null,
  });
  if (res.ok) revalidatePath("/admin/writing-practice");
  return res;
}

/** The owner's "Add Task 2" form: wording + topic, saved unpublished. */
export async function createTask2PracticeAction(formData: FormData) {
  await requireAdmin();
  const res = await createTask2Question({
    prompt: String(formData.get("prompt") ?? ""),
    topic: String(formData.get("topic") ?? ""),
  });
  if (res.ok) revalidatePath("/admin/writing-practice");
  return res;
}

export async function setPracticeQuestionPublished(id: string, published: boolean) {
  await requireAdmin();
  const res = await setPracticePublished(id, published);
  if (res.ok) {
    revalidatePath("/admin/writing-practice");
    revalidatePath("/writing");
  }
  return res;
}
