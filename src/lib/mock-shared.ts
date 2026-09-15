// The Mock exam section (migration 0050) — the parts both the server and the
// client need.
//
// Imports NOTHING, on purpose: the same constraint as discipline-shared.ts.
// There is no vitest `@/` alias, and `src/lib/mock.ts` is `server-only` (it
// holds the service-role client), so anything a client component or a unit
// test needs lives here.

export type MockAttemptStatus = "approved" | "in_progress" | "submitted" | "released";
export type MockRequestStatus = "pending" | "approved" | "rejected";
export type MockSection = "listening" | "reading" | "writing";

/** The real exam's order. A section opens only once the one before it is submitted. */
export const SECTION_ORDER: MockSection[] = ["listening", "reading", "writing"];

export const MAX_REQUEST_MESSAGE = 300;
/** A generous cap: a Task 2 essay is ~250–400 words, about 2–3 KB. */
export const MAX_ESSAY_CHARS = 20_000;

export const TASK1_MIN_WORDS = 150;
export const TASK2_MIN_WORDS = 250;

/**
 * Rounds a mean band the way IELTS rounds the Overall Band Score:
 * a fraction below .25 rounds down to the whole band, .25 up to below .75 rounds
 * to the half band, and .75 or above rounds up to the next whole band.
 *
 *   6.125 -> 6.0,  6.25 -> 6.5,  6.625 -> 6.5,  6.75 -> 7.0
 *
 * The epsilon absorbs floating-point error in the mean ((6 + 6.5 + 6.75) / 3 is
 * not exactly representable), which would otherwise round a true .25 down.
 */
export function roundBand(value: number): number {
  const whole = Math.floor(value + 1e-9);
  const frac = value - whole;
  if (frac < 0.25 - 1e-9) return whole;
  if (frac < 0.75 - 1e-9) return whole + 0.5;
  return whole + 1;
}

/**
 * Overall band from the section bands that exist. Null until every one of
 * listening, reading and writing has a band — an overall computed from two
 * sections would be published as if it described the whole exam.
 */
export function overallBand(bands: {
  listening: number | null;
  reading: number | null;
  writing: number | null;
}): number | null {
  const { listening, reading, writing } = bands;
  if (listening == null || reading == null || writing == null) return null;
  return roundBand((listening + reading + writing) / 3);
}

/**
 * The writing band from the two task bands. Task 2 carries twice the weight of
 * Task 1, as in the real marking. The owner can override the result.
 */
export function writingBand(task1: number | null, task2: number | null): number | null {
  if (task1 == null || task2 == null) return null;
  return roundBand((task1 + 2 * task2) / 3);
}

/** A valid band: 0–9 in half steps. */
export function isBand(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 9 &&
    Number.isInteger(value * 2)
  );
}

/** Words as an examiner counts them: whitespace-separated tokens. */
export function countWords(text: string | null | undefined): number {
  if (!text) return 0;
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/**
 * Which section the student should be on next, or null once all three are
 * submitted. Pure, so the page, the gate and the tests agree.
 */
export function nextSection(attempt: {
  listening_submitted_at: string | null;
  reading_submitted_at: string | null;
  writing_submitted_at: string | null;
}): MockSection | null {
  if (!attempt.listening_submitted_at) return "listening";
  if (!attempt.reading_submitted_at) return "reading";
  if (!attempt.writing_submitted_at) return "writing";
  return null;
}

export const STATUS_LABEL: Record<MockAttemptStatus, string> = {
  approved: "Approved — not started",
  in_progress: "In progress",
  submitted: "Submitted — awaiting results",
  released: "Results released",
};
