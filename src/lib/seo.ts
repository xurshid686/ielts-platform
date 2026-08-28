import { SITE_NAME, SITE_URL } from "./site";

/**
 * Search-facing text for a single test.
 *
 * Everything here is built from fields the database already has — title,
 * question_types, passage, total — because that is the material students
 * actually search for ("Life on Mars IELTS reading answers"). The passage body
 * is deliberately NOT used: it is Cambridge copy, and the same text sits on
 * dozens of sites, so republishing it is both a copyright exposure and
 * duplicate content Google will ignore.
 */

export type SeoTest = {
  id: string;
  title: string;
  skill: "reading" | "listening";
  kind?: "single" | "full" | null;
  tier?: string | null;
  passage?: number | null;
  total?: number | null;
  question_types?: string[] | null;
};

/** "Passage 3" / "Section 2" / "Full test" — how the paper is shaped. */
export function testFormat(t: SeoTest): string {
  if (t.kind === "full") return "Full test";
  if (t.skill === "reading") return t.passage ? `Passage ${t.passage}` : "Single passage";
  return "Section";
}

/**
 * The <title>. Leads with the passage name, then the exact words students type.
 *
 * Reading searches follow three patterns, and the title has to cover all of
 * them because it is the strongest relevance signal Google has:
 *
 *   "<name> reading"           -> "Reading"
 *   "<name> reading passage"   -> "Reading Passage"
 *   "<name> reading answers"   -> "Answers"
 *
 * "Practice" covered only the first. Listening searches use "Section" and
 * "Answers" the same way.
 */
export function testTitle(t: SeoTest): string {
  const noun = t.skill === "reading" ? "Reading Passage" : "Listening Test";
  return `${t.title} — IELTS ${noun} & Answers`;
}

/**
 * The meta description. Names the passage, its shape, how many questions and
 * which question types — the things a student scanning results wants to see.
 * Kept under ~160 characters so Google does not truncate it mid-sentence.
 */
export function testDescription(t: SeoTest): string {
  const noun = t.skill === "reading" ? "Reading passage" : "Listening test";

  // "answers" and "passage" go in the FIRST clause, not the last: the tail is
  // what gets cut, and those are the words students actually search for.
  const head = `${t.title} — IELTS ${noun} with answers and explanations.`;

  const bits: string[] = [testFormat(t)];
  if (t.total && t.total > 0) bits.push(`${t.total} questions`);
  const types = (t.question_types ?? []).filter(Boolean).slice(0, 2);
  if (types.length) bits.push(types.join(", "));

  const tail = ` ${bits.join(" · ")}. Free online practice.`;

  // Trim on a word boundary — the old cap sliced mid-word ("explana…"), which
  // reads as a broken page in the search result.
  const full = head + tail;
  if (full.length <= 160) return full;
  if (head.length <= 160) return head;
  return `${head.slice(0, 157).replace(/\s+\S*$/, "")}…`;
}

/** Absolute canonical URL for a test, always on the canonical host. */
export function testCanonical(t: Pick<SeoTest, "id" | "skill">): string {
  return `${SITE_URL}/${t.skill}/${t.id}`;
}

/**
 * schema.org LearningResource for the test page.
 *
 * `isAccessibleForFree` is driven by the real tier, so premium papers are
 * described honestly rather than advertised as free.
 */
export function testJsonLd(t: SeoTest): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "LearningResource",
    name: testTitle(t),
    headline: t.title,
    description: testDescription(t),
    url: testCanonical(t),
    learningResourceType: "Practice test",
    educationalLevel: "IELTS",
    inLanguage: "en",
    isAccessibleForFree: t.tier !== "premium",
    teaches: t.skill === "reading" ? "IELTS Academic Reading" : "IELTS Listening",
    ...(t.total && t.total > 0 ? { numberOfQuestions: t.total } : {}),
    provider: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
  };
}
