"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { rawToBand } from "@/lib/ielts/bandTable";
import { gradeAnswers, asAnswerKey, asAnswers, type Answers } from "@/lib/ielts/grade";

export type SaveResultInput = {
  testId: string | null;
  skill: "reading" | "listening";
  // Client-reported score — used ONLY as a fallback for tests that have no
  // stored answer key. When a key exists, the server grades `answers` and
  // ignores these, so the score cannot be fabricated.
  raw: number;
  total: number;
  band?: number;
  answers?: Answers;
};

export type SaveResultResult =
  | {
      ok: true;
      deduped: boolean; // true = identical submit already counted moments ago
      firstToday: boolean; // true = this was the first completed activity today
      band: number;
      streak: number;
      longest_streak: number;
      xp: number;
    }
  | { ok: false; error: string };

export async function saveResult(input: SaveResultInput): Promise<SaveResultResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You are not signed in." };

  // --- Score: server grades from the stored key when there is one ---
  // (the client-reported raw/total/band are only a fallback for keyless tests).
  let raw = 0;
  let total = 1;
  let band = 0;

  let serverGraded = false;
  if (input.testId) {
    const { data: testRow } = await supabase
      .from("tests")
      .select("answer_key")
      .eq("id", input.testId)
      .single();
    const key = asAnswerKey((testRow as { answer_key?: unknown } | null)?.answer_key);
    const answers = asAnswers(input.answers);
    if (key) {
      // A keyed test with no/blank answers means harvesting failed — grade what
      // we have (a perfect-score fake is still impossible: raw comes from us).
      const graded = gradeAnswers(key, answers ?? {});
      raw = graded.raw;
      total = graded.total;
      band = rawToBand(input.skill, raw, total);
      serverGraded = true;
    }
  }

  if (!serverGraded) {
    raw = Math.max(0, Math.round(input.raw));
    total = Math.max(1, Math.round(input.total));
    band =
      typeof input.band === "number" && input.band > 0
        ? input.band
        : rawToBand(input.skill, raw, total);
  }

  // Idempotency guard: ignore an identical re-submit of the same test within 30s
  // (protects against any accidental double-fire inflating XP/streak).
  const since = new Date(Date.now() - 30_000).toISOString();
  let recentQuery = supabase
    .from("results")
    .select("id")
    .eq("user_id", user.id)
    .gte("submitted_at", since)
    .limit(1);
  recentQuery = input.testId
    ? recentQuery.eq("test_id", input.testId)
    : recentQuery.is("test_id", null);
  const { data: recent } = await recentQuery;
  if (recent && recent.length > 0) {
    return { ok: true, deduped: true, firstToday: false, band, streak: 0, longest_streak: 0, xp: 0 };
  }

  // Was this the first completed activity today? (drives the once-a-day celebration)
  const today = new Date().toISOString().slice(0, 10);
  const { data: prof } = await supabase
    .from("profiles")
    .select("last_activity_date")
    .eq("id", user.id)
    .single();
  const firstToday = (prof as { last_activity_date?: string | null } | null)?.last_activity_date !== today;

  // Persist the student's answers so they can reopen the test for review.
  // (The answer key already lives on the test; we only store what they typed.)
  const storedAnswers = asAnswers(input.answers);

  const baseRow = {
    user_id: user.id,
    test_id: input.testId,
    skill: input.skill,
    raw,
    total,
    band,
  };

  let { error } = await supabase
    .from("results")
    .insert({ ...baseRow, answers: storedAnswers });
  // Graceful fallback if the 0013 migration hasn't been applied yet
  // (42703 = undefined_column): save the result without the answers.
  if (error && (error.code === "42703" || /answers/i.test(error.message))) {
    ({ error } = await supabase.from("results").insert(baseRow));
  }
  if (error) return { ok: false, error: error.message };

  const { data: act } = await supabase.rpc("record_activity", { p_xp: 20 });
  const a = act?.[0];

  revalidatePath("/dashboard");
  revalidatePath(`/${input.skill}`);

  return {
    ok: true,
    deduped: false,
    firstToday,
    band,
    streak: a?.streak ?? 0,
    longest_streak: a?.longest_streak ?? 0,
    xp: a?.xp ?? 0,
  };
}
