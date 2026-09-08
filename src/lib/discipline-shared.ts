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
 * - `currentIndex` is the first incomplete day — the day the student is ON. It
 *   no longer gates anything: days after it used to be locked, and a single
 *   missed day therefore hid the whole rest of the programme. Every published
 *   day is open, and this index only decides what the header and the admin grid
 *   call "current";
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

// ------------------------------------------------------------- deadlines

/** What a day's deadline means right now. `ms` is always non-negative. */
export type DeadlineState =
  | { kind: "none" }
  | { kind: "upcoming"; ms: number }
  | { kind: "overdue"; ms: number };

/**
 * How a day's `due_at` stands against the clock.
 *
 * A deadline is an ABSOLUTE INSTANT, so this is a plain subtraction and the
 * answer is the same in every timezone — which is the whole reason the column
 * is `timestamptz` and the headline shown to a student is a duration rather
 * than a date. Exactly at the deadline counts as overdue: the moment has come.
 */
export function deadlineState(dueAt: string | null | undefined, now: Date): DeadlineState {
  if (!dueAt) return { kind: "none" };
  const due = new Date(dueAt).getTime();
  if (Number.isNaN(due)) return { kind: "none" };

  // Math.abs, not `-ms`: negating a zero difference yields -0, which compares
  // equal to 0 but prints as "-0" and would eventually surface somewhere odd.
  const ms = due - now.getTime();
  return ms > 0 ? { kind: "upcoming", ms } : { kind: "overdue", ms: Math.abs(ms) };
}

/**
 * Is this day late FOR THIS STUDENT?
 *
 * Only if the deadline has passed AND they have not finished it. Someone who
 * completed the work is never chased for it, whenever they did it — and a day
 * finished after its deadline is done, not outstanding.
 *
 * Derived on every read, like every other fact about progress here. Storing it
 * is what produced the "Day 2" bug this feature already had once.
 */
export function isOverdueFor(
  day: { due_at?: string | null },
  complete: boolean,
  now: Date,
): boolean {
  if (complete) return false;
  return deadlineState(day.due_at, now).kind === "overdue";
}

/**
 * How late a piece of work was HANDED IN, in ms — null when it was on time,
 * has no deadline, or was never done.
 *
 * `isOverdueFor` above answers "is this outstanding RIGHT NOW", and goes quiet
 * the moment the work arrives. That was enough while a missed day locked the
 * ladder, because the punishment was automatic. Now that nothing is locked, a
 * day finished five days late is otherwise indistinguishable from one finished
 * on time, and the owner has no way to see who is drifting. This is the durable
 * record: it compares the deadline to the SUBMISSION, so it still reads true
 * long after the fact.
 *
 * STRICTLY AFTER, where `deadlineState` counts the exact instant as overdue.
 * The two ask different questions: at the deadline the day IS due, but a
 * submission landing on that same instant made it — and a mark reading
 * "0 minutes late" would be noise. A student on the line gets the benefit.
 */
export function lateBy(
  dueAt: string | null | undefined,
  submittedAt: string | null | undefined,
): number | null {
  if (!dueAt || !submittedAt) return null;
  const due = new Date(dueAt).getTime();
  const at = new Date(submittedAt).getTime();
  if (Number.isNaN(due) || Number.isNaN(at)) return null;
  return at > due ? at - due : null;
}

/**
 * WHEN a day was finished: the moment its last outstanding test was first
 * attempted. Null while any test on it has never been done.
 *
 * The LATEST of the first attempts, not the earliest — a day with two papers
 * is not finished until both are, so the second one is what completes it. A day
 * with no tests is never finished, matching `deriveDayStatus`.
 */
export function dayFinishedAt(firstAttemptTimes: (string | null)[]): string | null {
  if (firstAttemptTimes.length === 0) return null;
  let latest = 0;
  for (const t of firstAttemptTimes) {
    if (!t) return null;
    const ms = new Date(t).getTime();
    if (Number.isNaN(ms)) return null;
    if (ms > latest) latest = ms;
  }
  return new Date(latest).toISOString();
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "3 days", "4 hours", "12 minutes", "less than a minute". */
function duration(ms: number, round: (n: number) => number): string {
  if (ms >= DAY) {
    const d = round(ms / DAY);
    return `${d} ${d === 1 ? "day" : "days"}`;
  }
  if (ms >= HOUR) {
    const h = round(ms / HOUR);
    return `${h} ${h === 1 ? "hour" : "hours"}`;
  }
  if (ms >= MINUTE) {
    const m = round(ms / MINUTE);
    return `${m} ${m === 1 ? "minute" : "minutes"}`;
  }
  return "less than a minute";
}

/**
 * What the student reads: "3 days left", "2 days late", or null when the day
 * carries no deadline.
 *
 * TIME REMAINING ROUNDS DOWN and TIME LATE ROUNDS UP, both against the student:
 * never tell someone they have longer than they really do, and never make a
 * missed deadline look fresher than it is. With rounding to nearest, 47 hours
 * would read "2 days left" when only one full day remains.
 */
export function deadlineLabel(state: DeadlineState): string | null {
  if (state.kind === "none") return null;
  if (state.kind === "upcoming") return `${duration(state.ms, Math.floor)} left`;
  return `${duration(state.ms, Math.ceil)} late`;
}

/**
 * "2 days late" — how late a finished piece of work was handed in.
 *
 * Rounds UP, like the overdue half of `deadlineLabel` and for the same reason:
 * never make a missed deadline look fresher than it was.
 */
export function lateLabel(ms: number): string {
  return `${duration(ms, Math.ceil)} late`;
}
