"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireProfile } from "@/lib/auth";
import {
  savePractice,
  setPracticePublished,
  type SaveResult,
} from "@/lib/writing-practice";

// Writing Task 2 practice — the server actions.
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
): Promise<SaveResult> {
  const profile = await requireProfile();
  return savePractice(profile.id, attemptId, answer, Math.max(0, Math.floor(revision)), final);
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
