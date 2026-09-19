// The kind of IELTS Writing Task 2 question a prompt is, read from its own
// instruction wording. Worked out at read time rather than stored: the type is
// a property of the text, so it can never drift from it, and a better rule
// re-files every question at once with no backfill.
//
// The patterns are deliberately forgiving: the corpus is what students
// reported, so it carries "Discuss both sides", "To what extend" and
// "overweigh" as often as the textbook wording.
//
// This file imports NOTHING, so it is unit-testable without the `@/` alias and
// usable from server and client components alike.

export type Task2Type =
  | "agree"
  | "discuss"
  | "advantages"
  | "positive-negative"
  | "problem-solution"
  | "two-part"
  | "other";

/** In display order. `label` is the full instruction a student sees in the exam. */
export const TASK2_TYPES: readonly { id: Task2Type; label: string }[] = [
  { id: "agree", label: "To what extent do you agree or disagree?" },
  { id: "discuss", label: "Discuss both views and give your own opinion." },
  { id: "advantages", label: "Do the advantages outweigh the disadvantages?" },
  { id: "positive-negative", label: "Is this a positive or negative development?" },
  { id: "problem-solution", label: "What are the causes of this problem? What solutions can you suggest?" },
  { id: "two-part", label: "Two-part questions (e.g. Why is this happening? Is it a good thing?)" },
  { id: "other", label: "Other question types" },
] as const;

const IDS = new Set<string>(TASK2_TYPES.map((t) => t.id));

export function isTask2Type(value: unknown): value is Task2Type {
  return typeof value === "string" && IDS.has(value);
}

export function task2TypeLabel(id: Task2Type): string {
  return TASK2_TYPES.find((t) => t.id === id)?.label ?? "Other question types";
}

// First match wins. Order matters: "Discuss both views" questions often also
// contain "?" sentences, and "agree" is the loosest pattern of the named types.
const RULES: readonly [Task2Type, RegExp][] = [
  ["discuss", /\bdiscuss\s+(both|these|the\s+two|two)\b/],
  [
    "advantages",
    /\b(advantages?|benefits?|positive\s+effects?|positives?|pros)\b.*\b(outweigh|overweigh|out\s+weigh)|\badvantages\s+and\s+disadvantages\b|\b(disadvantages?|drawbacks?)\b.*\b(outweigh|greater\s+than)\b/,
  ],
  ["positive-negative", /\b(positive\s+or\s+(a\s+)?negative|negative\s+or\s+(a\s+)?positive)\b/],
  ["agree", /\b(extent|extend)\b.*\bagree\b|\bdo\s+you\s+agree\b|\bagree\s+(or|and)\s+disagree\b/],
  [
    "problem-solution",
    /\b(causes?|reasons?|why)\b.*\b(solutions?|measures?|solv(e|ed|ing)|tackl(e|ed|ing)|overc[oa]me|be\s+done|we\s+do|address|deal\s+with|reduce|improve|help)\b|\b(problems?|issues?)\b.*\b(solutions?|measures?|solv(e|ed|ing)|tackl(e|ed|ing)|suggestions?)\b/,
  ],
];

export function classifyTask2(prompt: string): Task2Type {
  const text = prompt.toLowerCase().replace(/\s+/g, " ");
  for (const [type, re] of RULES) if (re.test(text)) return type;
  // Two direct questions, as two sentences or joined by "and".
  if ((text.match(/\?/g) ?? []).length >= 2) return "two-part";
  if (/\b(why|what|how)\b[^.?!]*\band\s+(what|how|why|is|are|do|does)\b[^.!]*\?/.test(text)) return "two-part";
  return "other";
}

// ------------------------------------------------------------------ search

/** Lowercase, accents off, punctuation to spaces, whitespace collapsed. */
export function normaliseSearch(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export const MAX_SEARCH = 100;

/** The search's words, or [] for no search. */
export function searchTokens(q: string | null | undefined): string[] {
  if (!q) return [];
  return normaliseSearch(q.slice(0, MAX_SEARCH)).split(" ").filter(Boolean);
}

/** Every word must appear somewhere in the text (AND, substring). */
export function matchesSearch(text: string, tokens: readonly string[]): boolean {
  if (!tokens.length) return true;
  const hay = normaliseSearch(text);
  return tokens.every((t) => hay.includes(t));
}
