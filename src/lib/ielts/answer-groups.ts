// "Choose TWO / THREE letters" groups: pure helpers, no imports beyond ./extract-key (unit-testable).
//
// THE BUG THIS FIXES (owner report, 2026-11-28): the scoring bridge harvests a checkbox group by
// SORTING the ticked letters and handing them to the group's questions by position. With a key of
// A, F, G on Q18-20, a student who ticks A, B, F sends 18=A, 19=B, 20=F and is marked 1/3, although
// two of their letters are right. IELTS marks these groups as a set, in any order.
//
// The fix lives on the SERVER, because the browser has no key while the student works (it is
// stripped, see sanitize-test-html.ts), so it cannot place letters itself. The groups are read from
// the test's OWN stored HTML, never from the request: a group list sent by the browser could
// declare the whole paper one group and let a student shuffle answers between questions.

import { normalizeAnswer } from "./extract-key";

export type AnswerKeyLike = Record<string, string[]>;
export type AnswersLike = Record<string, string>;

/**
 * Every multi-select group the paper declares, as lists of question numbers:
 *  - listening players: `.mcq.multi[data-qs="18,19,20"]`
 *  - reading shells:    `[data-mcq-group="27,28"]` or a range `"27-28"`
 * Only groups of 2-5 consecutive questions are kept: anything else is not a choose-N block
 * and grading it as a set would be wrong.
 */
export function parseAnswerGroups(html: string): number[][] {
  const out: number[][] = [];
  const seen = new Set<string>();
  // Markup only: the listening engine's own source COMMENTS say `data-qs="27,28"`, and reading a
  // comment as a group would mark two ordinary questions as an any-order pair.
  const markup = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");
  const re = /<[a-z][^>]*?\sdata-(?:qs|mcq-group)\s*=\s*["']([^"']+)["']/gi;
  for (const m of markup.matchAll(re)) {
    let qs: number[];
    const range = m[1].trim().match(/^(\d+)\s*[-–—]\s*(\d+)$/);
    if (range) {
      const a = Number(range[1]), b = Number(range[2]);
      qs = [];
      for (let q = a; q <= b && qs.length <= 6; q++) qs.push(q);
    } else {
      qs = m[1].split(",").map((s) => Number(s.trim()));
    }
    if (qs.length < 2 || qs.length > 5 || qs.some((q) => !Number.isInteger(q) || q < 1)) continue;
    if (qs.some((q, i) => i > 0 && q !== qs[i - 1] + 1)) continue;
    const k = qs.join(",");
    if (!seen.has(k)) { seen.add(k); out.push(qs); }
  }
  return out;
}

/**
 * Re-seats the student's letters inside each group: a letter that is the key of one of the
 * group's questions goes to that question; the rest fill the remaining questions in order.
 * Nothing outside a group is touched, no letter is added or dropped, and a group the student
 * left blank stays blank. The result is what gets graded AND stored, so /review shows the
 * same marks the score was computed from.
 */
export function regroupAnswers(key: AnswerKeyLike, answers: AnswersLike, groups: number[][]): AnswersLike {
  const out: AnswersLike = { ...answers };
  for (const qs of groups) {
    if (!qs.every((q) => key[String(q)])) continue;            // the key must cover the whole group
    const given = qs.map((q) => answers[String(q)]).filter((v): v is string => !!v && !!normalizeAnswer(v));
    if (!given.length) continue;
    const placed = new Map<number, string>();
    const left: string[] = [];
    for (const v of given) {
      const n = normalizeAnswer(v);
      const home = qs.find((q) => !placed.has(q) && key[String(q)].some((k) => normalizeAnswer(k) === n));
      if (home !== undefined) placed.set(home, v);
      else left.push(v);
    }
    for (const q of qs) {
      if (!placed.has(q) && left.length) placed.set(q, left.shift()!);
    }
    for (const q of qs) {
      const v = placed.get(q);
      if (v) out[String(q)] = v;
      else delete out[String(q)];
    }
  }
  return out;
}
