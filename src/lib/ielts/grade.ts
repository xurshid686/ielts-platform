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
 */
export function gradeAnswers(key: AnswerKey, answers: Answers): Graded {
  const qs = Object.keys(key);
  let raw = 0;
  for (const q of qs) {
    const given = normalizeAnswer(answers?.[q]);
    if (given && key[q].includes(given)) raw++;
  }
  return { raw, total: qs.length };
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
