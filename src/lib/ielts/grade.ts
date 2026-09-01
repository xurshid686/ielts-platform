// Server-side grading: the single trusted place a raw score is computed.
// The client (iframe) sends the user's ANSWERS, never a score — so a fabricated
// score is impossible for any test that has a stored answer key.

import { type AnswerKey, normalizeAnswer } from "./extract-key";

export type Answers = Record<string, string>;

export type Graded = { raw: number; total: number };

/**
 * Grades a map of user answers against a stored answer key. A question is
 * correct when its normalised answer matches any accepted variant. Mirrors the
 * in-page isCorrect() so the server score equals what the test would show.
 *
 * `skill` exists because the two shells do not mark identically. The listening
 * player's isCorrect() falls back to comparing with ALL spaces removed — its own
 * comment says "postcode" — so it accepts `SW1 9AB` against a key of `sw19ab`.
 * The reading shells have no such rule and mark that wrong. Applying the looser
 * rule everywhere would make the server disagree with a reading page in the
 * other direction, so it is enabled only where the page actually does it.
 * Omitted, grading stays strict.
 */
export function gradeAnswers(
  key: AnswerKey,
  answers: Answers,
  skill?: "reading" | "listening",
): Graded {
  const qs = Object.keys(key);
  let raw = 0;
  for (const q of qs) {
    if (isAnswerCorrect(key[q], answers?.[q], skill)) raw++;
  }
  return { raw, total: qs.length };
}

/**
 * Marks ONE answer, with exactly the rules gradeAnswers uses.
 *
 * Exported because /review/[id] needs to show the same per-question verdict the
 * score was computed from. It used to re-implement the check as a bare
 * `accepted.includes(given)`, which omits the listening space-insensitive rule
 * above — so a student could be told Band 7 on submit and then shown a
 * breakdown marking one of the counted answers wrong.
 */
export function isAnswerCorrect(
  accepted: string[] | undefined,
  given: unknown,
  skill?: "reading" | "listening",
): boolean {
  if (!accepted) return false;
  const value = normalizeAnswer(given);
  if (!value) return false;
  if (accepted.includes(value)) return true;
  if (skill !== "listening") return false;
  const bare = value.replace(/\s+/g, "");
  return !!bare && accepted.some((v) => v.replace(/\s+/g, "") === bare);
}

// Narrow an untrusted jsonb value from the DB into an AnswerKey.
export function asAnswerKey(value: unknown): AnswerKey | null {
  if (!value || typeof value !== "object") return null;
  const out: AnswerKey = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (Array.isArray(v)) out[k] = v.map((x) => String(x));
  }
  return Object.keys(out).length ? out : null;
}

// Narrow an untrusted answers payload from the iframe into an Answers map.
export function asAnswers(value: unknown): Answers | null {
  if (!value || typeof value !== "object") return null;
  const out: Answers = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (/^\d+$/.test(k) && (typeof v === "string" || typeof v === "number")) {
      out[k] = String(v);
    }
  }
  return Object.keys(out).length ? out : null;
}
