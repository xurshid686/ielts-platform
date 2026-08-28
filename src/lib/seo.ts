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

/** The <title>. Leads with the passage name, which is the search term. */
export function testTitle(t: SeoTest): string {
  const skill = t.skill === "reading" ? "Reading" : "Listening";
  return `${t.title} — IELTS ${skill} Practice`;
}

/**
 * The meta description. Names the passage, its shape, how many questions and
 * which question types — the things a student scanning results wants to see.
 * Kept under ~160 characters so Google does not truncate it mid-sentence.
 */
export function testDescription(t: SeoTest): string {
  const skill = t.skill === "reading" ? "Reading" : "Listening";
  const parts: string[] = [`Practice the IELTS ${skill} test “${t.title}”`];

  const bits: string[] = [testFormat(t)];
  if (t.total && t.total > 0) bits.push(`${t.total} questions`);
  parts.push(bits.join(", "));

  const types = (t.question_types ?? []).filter(Boolean).slice(0, 2);
  if (types.length) parts.push(`with ${types.join(" and ")}`);

  let out = `${parts.join(" — ")}. Instant scoring, answers and explanations.`;
  if (out.length > 160) out = `${out.slice(0, 157).replace(/[\s—,.]+$/, "")}…`;
  return out;
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
