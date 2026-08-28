"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveTestAccess } from "@/lib/tests/access";
import { localDay } from "@/lib/day";
import { rawToBand } from "@/lib/ielts/bandTable";
import { gradeAnswers, asAnswerKey, asAnswers, type Answers } from "@/lib/ielts/grade";

export type SaveResultInput = {
  testId: string | null;
  // The skill the CLIENT believes this was. It is only trusted for keyless /
  // test-less submissions; whenever there is a real test row, the skill is
  // read from it instead. See the note in saveResult().
  skill: "reading" | "listening";
  // Client-reported score — used ONLY as a fallback for tests that have no
  // stored answer key (those still score themselves in-page; see
  // /api/test-html). When a key exists the server grades `answers` and never
  // reads these, so the score cannot be fabricated. Sanitized tests don't send
  // them at all, which is why they are optional.
  raw?: number;
  total?: number;
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
      // The AUTHORITATIVE score. For a keyed test the client never computes
      // these — it only reports answers — so the UI must render what comes back
      // from here rather than anything it sent.
      resultId: string | null;
      raw: number;
      total: number;
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

  // The skill this attempt is recorded under. For a real test it comes from
  // the TEST ROW, never from the caller: `skill` selects the marking rules
  // (gradeAnswers is space-insensitive for listening) AND the band table, and
  // apply_rating decides from it whether the reading ladder applies. When the
  // client chose it, declaring a reading paper "listening" bought looser
  // marking, a different band curve, and a way to dodge a rating loss.
  let skill: "reading" | "listening" = input.skill === "listening" ? "listening" : "reading";

  let serverGraded = false;
  if (input.testId) {
    // Entitlement first. This action reads the answer key with the SERVICE-ROLE
    // client, so without this check any signed-in account could post answers
    // for a premium test it cannot open and read the authoritative `raw` back —
    // an answer-key oracle, and a results row for content it never bought.
    // `resolveTestAccess` is the one place that decides this (see CLAUDE.md);
    // /api/test-html, /api/test-key and /api/test-video all defer to it.
    const access = await resolveTestAccess(input.testId);
    if (!access.ok) {
      return {
        ok: false,
        error:
          access.status === 403
            ? "This test needs a Premium membership."
            : "That test isn't available.",
      };
    }
    if (access.row.skill === "reading" || access.row.skill === "listening") {
      skill = access.row.skill;
    }

    // `answer_key` is revoked from the `authenticated` role (migration 0034),
    // so it is read here with the service-role client and used only to compute
    // the score. It is never returned to the caller.
    const key = asAnswerKey(access.row.answer_key);
    const answers = asAnswers(input.answers);
    if (key) {
      // A keyed test with no/blank answers means harvesting failed — grade what
      // we have (a perfect-score fake is still impossible: raw comes from us).
      const graded = gradeAnswers(key, answers ?? {}, skill);
      raw = graded.raw;
      total = graded.total;
      band = rawToBand(skill, raw, total);
      serverGraded = true;
    }
  }

  if (!serverGraded) {
    // Keyless test: the page scored itself and we have nothing to check it
    // against. Refuse a submission that carries no numbers at all rather than
    // writing a meaningless 0/1 row.
    if (typeof input.raw !== "number" || typeof input.total !== "number") {
      return {
        ok: false,
        error: "This test has no stored answer key yet, so it can't be scored. Please tell an admin.",
      };
    }
    raw = Math.max(0, Math.round(input.raw));
    total = Math.max(1, Math.round(input.total));
    band =
      typeof input.band === "number" && input.band > 0
        ? input.band
        : rawToBand(skill, raw, total);
  }

  // Idempotency guard: ignore an identical re-submit of the same test within 30s
  // (protects against any accidental double-fire inflating XP/streak).
  //
  // It returns the ORIGINAL result id. Returning null here used to strand the
  // student: TestRunner bails on `deduped`, `saved` stays null, and "Exit"
  // falls back to the catalogue instead of /review/[id] — which is what a
  // legitimate retry after a dropped connection hits.
  const since = new Date(Date.now() - 30_000).toISOString();
  let recentQuery = supabase
    .from("results")
    .select("id")
    .eq("user_id", user.id)
    .gte("submitted_at", since)
    .order("submitted_at", { ascending: false })
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
      resultId: (recent[0] as { id?: string }).id ?? null,
      raw,
      total,
      band,
      streak: 0,
      longest_streak: 0,
      xp: 0,
      rating: null,
    };
  }

  // Was this the first completed activity today? (drives the once-a-day celebration)
  //
  // "Today" is the student's own day, not the server's. record_activity() has
  // always closed the streak day in `profiles.timezone` (migration 0018); this
  // used to slice a UTC ISO string, so for a UTC+5 student everything between
  // midnight and 05:00 local was filed under yesterday and disagreed with the
  // streak it was meant to celebrate.
  const { data: prof } = await supabase
    .from("profiles")
    .select("last_activity_date, timezone")
    .eq("id", user.id)
    .single();
  const profile = prof as { last_activity_date?: string | null; timezone?: string | null } | null;
  const today = localDay(profile?.timezone);
  const firstToday = profile?.last_activity_date !== today;

  // --- XP award: tie XP to genuine practice so it can't be farmed into free
  // progress and the leaderboards. Full XP for the FIRST attempt of a real
  // test; a small amount for an occasional retake (at most once per test per day); nothing
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
      // Compare in the student's timezone too, for the same reason as above —
      // slicing the raw ISO string compares UTC days against a local `today`.
      const doneToday = prior.some(
        (r) => localDay(profile?.timezone, new Date(r.submitted_at)) === today,
      );
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
    skill,
    raw,
    total,
    band,
  };

  // Insert and grab the new row's id so the rating engine can grade it.
  //
  // Written with the SERVICE-ROLE client on purpose. A results row is a scored
  // record, and `results_insert_owner` let any member write one straight
  // through PostgREST — which is how the referral trigger could be paid off
  // with a junk row, and how a fabricated score reached the dashboard. This is
  // now the only path that writes one, so migration 0038 revokes the direct
  // INSERT grant. `user_id` is taken from the verified session, never the
  // input, because the service role bypasses RLS and cannot rely on it.
  const writer = createAdminClient();
  let resultId: string | null = null;
  let { data: inserted, error } = await writer
    .from("results")
    .insert({ ...baseRow, answers: storedAnswers, duration_seconds: duration })
    .select("id")
    .single();
  // Graceful fallback if migration 0013/0016 hasn't been applied yet
  // (42703 = undefined_column): retry without the newer columns.
  if (error && (error.code === "42703" || /answers|duration_seconds/i.test(error.message))) {
    ({ data: inserted, error } = await writer
      .from("results")
      .insert(baseRow)
      .select("id")
      .single());
  }
  if (error) return { ok: false, error: error.message };
  resultId = (inserted as { id?: string } | null)?.id ?? null;

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
  revalidatePath(`/${skill}`);

  return {
    ok: true,
    deduped: false,
    firstToday,
    resultId,
    raw,
    total,
    band,
    streak: a?.streak ?? 0,
    longest_streak: a?.longest_streak ?? 0,
    xp: a?.xp ?? 0,
    rating,
  };
}
