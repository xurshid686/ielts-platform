"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { notifyNewAttempt } from "@/lib/telegram/notify";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveTestAccess } from "@/lib/tests/access";
import { recordDisciplineProgress } from "@/lib/discipline";
import { localDay } from "@/lib/day";
import { rawToBand } from "@/lib/ielts/bandTable";
import { gradeAnswers, asAnswerKey, asAnswers, type Answers } from "@/lib/ielts/grade";

export type SaveResultInput = {
  // Required. A submission with no test behind it used to be accepted and
  // written verbatim — see the guard at the top of saveResult().
  testId: string | null;
  // The skill the CLIENT believes this was. Never trusted: the skill is always
  // read from the test row. Kept in the payload because the bridge sends it
  // and it is useful in the error path.
  skill: "reading" | "listening";
  // Client-reported score. NO LONGER USED to persist anything — the server
  // grades from the stored key or refuses the submission. Kept optional in the
  // type so older embedded bridges can keep posting it harmlessly.
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

  // A submission must name a test. Without this, the entitlement + grading
  // block below was skipped entirely and the caller's own raw/total/band were
  // written straight to `results` with the service-role client:
  //
  //   saveResult({ testId: null, skill: "reading", raw: 40, total: 40, band: 9 })
  //
  // — a fabricated perfect attempt in the student's history, feeding the
  // dashboard averages, the weekly report and the badge thresholds. That is
  // the outcome 0038 revoked the direct INSERT grant to prevent; it was
  // reachable through this action instead. Every test in the library has a
  // stored answer key, so nothing legitimate takes this path.
  if (!input.testId) {
    return { ok: false, error: "This attempt isn't linked to a test, so it can't be saved." };
  }

  // --- Score: the server grades from the stored key. Always. ---
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
  //
  // A test with no stored key cannot be scored by anyone but the page itself,
  // and a page-reported score is unverifiable — that fallback is what let a
  // caller name its own band. Every test in the library has a key
  // (`scripts/audit-answer-keys.mjs` checks this), so refusing is correct
  // rather than merely strict: a keyless test is a data bug to fix at upload,
  // not a score to accept.
  const key = asAnswerKey(access.row.answer_key);
  if (!key) {
    return {
      ok: false,
      error: "This test has no stored answer key yet, so it can't be scored. Please tell an admin.",
    };
  }

  // A keyed test with no/blank answers means harvesting failed — grade what
  // we have (a perfect-score fake is still impossible: raw comes from us).
  const graded = gradeAnswers(key, asAnswers(input.answers) ?? {}, skill);
  raw = graded.raw;
  total = graded.total;
  band = rawToBand(skill, raw, total);

  // Idempotency guard: ignore an identical re-submit of the same test within 30s
  // (protects against any accidental double-fire inflating XP/streak).
  //
  // It returns the ORIGINAL result id. Returning null here used to strand the
  // student: TestRunner bails on `deduped`, `saved` stays null, and "Exit"
  // falls back to the catalogue instead of /review/[id] — which is what a
  // legitimate retry after a dropped connection hits.
  const since = new Date(Date.now() - 30_000).toISOString();
  const { data: recent } = await supabase
    .from("results")
    .select("id")
    .eq("user_id", user.id)
    .eq("test_id", input.testId)
    .gte("submitted_at", since)
    .order("submitted_at", { ascending: false })
    .limit(1);
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
  // progress and the leaderboards. Full XP for the FIRST attempt of a test, a
  // small amount for an occasional retake (at most once per test per day).
  // Every submission that reaches here is server-graded against a stored key,
  // so there is no longer an unverifiable-score tier to withhold XP from. ---
  let xpAward: number;
  const { data: priorRows } = await supabase
    .from("results")
    .select("submitted_at")
    .eq("user_id", user.id)
    .eq("test_id", input.testId);
  const prior = (priorRows ?? []) as { submitted_at: string }[];
  if (prior.length === 0) {
    xpAward = 20; // first time on this test
  } else {
    // Compare in the student's timezone too, for the same reason as above —
    // slicing the raw ISO string compares UTC days against a local `today`.
    const doneToday = prior.some(
      (r) => localDay(profile?.timezone, new Date(r.submitted_at)) === today,
    );
    xpAward = doneToday ? 0 : 5; // a retake — capped to once per day
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
  const { data: inserted, error } = await writer
    .from("results")
    .insert({ ...baseRow, answers: storedAnswers, duration_seconds: duration })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  const resultId = (inserted as { id?: string } | null)?.id ?? null;

  // --- Rating: only the FIRST attempt of a server-graded reading test moves
  // the standing. apply_rating() is the single trusted place for that logic
  // (it also runs every anti-cheat rule). ---
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

  // Streak + XP. Awarded through the SERVICE-ROLE client on purpose: the
  // session-scoped `record_activity` was granted to `authenticated`, so a
  // student could POST it in a loop and mint XP without completing anything
  // (30 per call, uncapped per day). Migration 0041 revokes that grant;
  // `record_activity_for` (0040) is service-role only and takes the user id
  // explicitly, because the service role has no `auth.uid()` to read.
  const { data: act, error: actErr } = await writer.rpc("record_activity_for", {
    p_user_id: user.id,
    p_xp: xpAward,
  });
  // The score is already saved, so a failure here must not fail the submission
  // — but it must not be silent either. The likeliest cause is a deploy that
  // ran ahead of migration 0040, which would otherwise stop every streak and
  // XP award site-wide with no signal at all.
  if (actErr) {
    console.error(`[saveResult] record_activity_for failed for ${user.id}: ${actErr.message}`);
  }
  const a = act?.[0];

  // Discipline: tick the day off if this submission completed it. Runs after
  // the result exists, and its own failure must not fail the submission — the
  // score is already saved, and the recorder is idempotent, so the next
  // submission (or a manual nudge) puts the student in the right place.
  try {
    await recordDisciplineProgress(user.id, input.testId, resultId);
  } catch (e) {
    console.error(`[saveResult] discipline progress failed for ${user.id}: ${String(e)}`);
  }

  // Tell the owner, AFTER the student has their result.
  //
  // `after()` runs the callback once the response is finished, so a slow or
  // unreachable Telegram cannot delay a submission — and notifyNewAttempt()
  // swallows its own errors, so it cannot fail one either. Both properties
  // matter: this is the scored-write path, and its job is to save the score.
  after(() =>
    notifyNewAttempt({
      userId: user.id,
      testId: input.testId!,
      skill,
      raw,
      total,
      band,
    }),
  );

  revalidatePath("/dashboard");
  revalidatePath("/leaderboard");
  revalidatePath("/discipline");
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
