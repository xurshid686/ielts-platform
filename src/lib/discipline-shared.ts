// The pieces of the Discipline feature that carry no server dependencies.
//
// Two reasons this file exists:
//   1. lib/discipline.ts is `server-only` (it holds the service-role writer), so
//      the admin UI — a client component — cannot import the strike limit from
//      there without dragging the server module into the browser bundle.
//   2. The progress rule below is the thing that broke in production, so it is
//      unit-tested. There is no vitest config and therefore no `@/` alias, so a
//      tested module must import relatively and pull in neither `server-only`
//      nor a Supabase client. This file imports nothing at all.

/** Strikes allowed before the owner resets a student to Day 1. */
export const STRIKE_LIMIT = 3;

/** One saved attempt, reduced to what the progress rule needs. */
export type ResultRow = {
  test_id: string;
  submitted_at: string;
};

/**
 * Does this result count towards the student's current run at the challenge?
 *
 * A reset stamps `discipline_members.reset_at` rather than deleting anything,
 * so results from before it belong to a run the student already lost. Filtering
 * by date is what lets Reset take their progress while their scores, XP, streak
 * and rating — all real, graded records — survive untouched.
 */
export function countsAfterReset(submittedAt: string, resetAt: string | null): boolean {
  if (!resetAt) return true;
  return new Date(submittedAt).getTime() >= new Date(resetAt).getTime();
}

/**
 * Which days are complete, and which day the student is on.
 *
 * THE definition of "done" for the whole feature. It replaced
 * `discipline_members.current_day` and the `discipline_completions` table, which
 * were written only on submission and so went stale on any programme edit: after
 * a finished day was deleted and rebuilt, the stored counter pointed past the
 * end of the programme and a student facing a single Day 1 was told "Day 2".
 *
 * - a day is complete when it has at least one test and the student has a
 *   counting attempt at every one of them;
 * - `currentIndex` is the first incomplete day, and every day after it is
 *   locked;
 * - once the programme is finished `currentIndex` is the LAST day, so the
 *   header reads "Day N of N" and never names a day that does not exist;
 * - an empty programme gives -1, meaning "nothing to show".
 */
export function deriveDayStatus(
  days: { tests: { id: string }[] }[],
  doneTestIds: ReadonlySet<string>,
): { complete: boolean[]; currentIndex: number } {
  const complete = days.map(
    (d) => d.tests.length > 0 && d.tests.every((t) => doneTestIds.has(t.id)),
  );
  const firstIncomplete = complete.indexOf(false);
  const currentIndex =
    days.length === 0 ? -1 : firstIncomplete === -1 ? days.length - 1 : firstIncomplete;
  return { complete, currentIndex };
}
