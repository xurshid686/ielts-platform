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
  // Seconds the student spent on the test (TestRunner measures iframe-load →
  // result). Drives the "completed too fast" anti-cheat check. Optional.
  durationSeconds?: number;
};

// What the rating engine did with this attempt (null when it wasn't eligible —
// e.g. a retake, a non-reading skill, or a keyless test).
export type RatingOutcome = {
  rated: boolean;
  rating: number | null; // new rating after this attempt
  delta: number; // rating change (may be negative)
  points: number; // weekly/monthly points earned
  flagged: boolean;
  reason: string | null;
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
      rating: RatingOutcome | null;
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
    return {
      ok: true,
      deduped: true,
      firstToday: false,
      band,
      streak: 0,
      longest_streak: 0,
      xp: 0,
      rating: null,
    };
  }

  // Was this the first completed activity today? (drives the once-a-day celebration)
  const today = new Date().toISOString().slice(0, 10);
  const { data: prof } = await supabase
    .from("profiles")
    .select("last_activity_date")
    .eq("id", user.id)
    .single();
  const firstToday = (prof as { last_activity_date?: string | null } | null)?.last_activity_date !== today;

  // --- XP award: tie XP to genuine practice so it can't be farmed into free
  // premium unlocks. Full XP for the FIRST attempt of a real test; a small
  // amount for an occasional retake (at most once per test per day); nothing
  // for keyless / no-test submissions (those scores are unverifiable). The
  // rating engine is unaffected — it independently gates on server-grading. ---
  let xpAward = 0;
  if (input.testId) {
    const { data: priorRows } = await supabase
      .from("results")
      .select("submitted_at")
      .eq("user_id", user.id)
      .eq("test_id", input.testId);
    const prior = (priorRows ?? []) as { submitted_at: string }[];
    if (prior.length === 0) {
      xpAward = serverGraded ? 20 : 10; // first time on this test
    } else {
      const doneToday = prior.some((r) => String(r.submitted_at).slice(0, 10) === today);
      xpAward = doneToday ? 0 : 5; // a retake — capped to once per day
    }
  }

  // Persist the student's answers so they can reopen the test for review.
  // (The answer key already lives on the test; we only store what they typed.)
  const storedAnswers = asAnswers(input.answers);

  const duration =
    typeof input.durationSeconds === "number" && input.durationSeconds >= 0
      ? Math.round(input.durationSeconds)
      : null;

  const baseRow = {
    user_id: user.id,
    test_id: input.testId,
    skill: input.skill,
    raw,
    total,
    band,
  };

  // Insert and grab the new row's id so the rating engine can grade it.
  let resultId: string | null = null;
  let { data: inserted, error } = await supabase
    .from("results")
    .insert({ ...baseRow, answers: storedAnswers, duration_seconds: duration })
    .select("id")
    .single();
  // Graceful fallback if migration 0013/0016 hasn't been applied yet
  // (42703 = undefined_column): retry without the newer columns.
  if (error && (error.code === "42703" || /answers|duration_seconds/i.test(error.message))) {
    ({ data: inserted, error } = await supabase
      .from("results")
      .insert(baseRow)
      .select("id")
      .single());
  }
  if (error) return { ok: false, error: error.message };
  resultId = (inserted as { id?: string } | null)?.id ?? null;

  // Mark any matching assignment (same skill + test) as submitted for this
  // student. Best-effort: a missing RPC (pre-0030) must not break saving.
  if (resultId && input.testId) {
    try {
      await supabase.rpc("complete_assignments", {
        p_skill: input.skill,
        p_test_id: input.testId,
        p_result_id: resultId,
        p_speaking_submission_id: null,
        p_writing_submission_id: null,
      });
    } catch {
      /* assignments feature not migrated yet — ignore */
    }
  }

  // --- Rating: only the FIRST attempt of a server-graded reading test moves
  // the standing. apply_rating() is the single trusted place for that logic
  // (it also runs every anti-cheat rule). Degrades gracefully pre-0016. ---
  let rating: RatingOutcome | null = null;
  if (resultId) {
    const { data: rate, error: rateErr } = await supabase.rpc("apply_rating", {
      p_result_id: resultId,
    });
    const row = (rate as
      | {
          rated: boolean;
          rating: number | null;
          rating_delta: number;
          points: number;
          flagged: boolean;
          reason: string | null;
        }[]
      | null)?.[0];
    if (!rateErr && row) {
      rating = {
        rated: row.rated,
        rating: row.rating,
        delta: row.rating_delta ?? 0,
        points: row.points ?? 0,
        flagged: row.flagged,
        reason: row.reason,
      };
    }
  }

  const { data: act } = await supabase.rpc("record_activity", { p_xp: xpAward });
  const a = act?.[0];

  revalidatePath("/dashboard");
  revalidatePath("/leaderboard");
  revalidatePath(`/${input.skill}`);

  return {
    ok: true,
    deduped: false,
    firstToday,
    band,
    streak: a?.streak ?? 0,
    longest_streak: a?.longest_streak ?? 0,
    xp: a?.xp ?? 0,
    rating,
  };
}
