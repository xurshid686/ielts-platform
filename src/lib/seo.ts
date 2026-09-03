import { SITE_NAME, SITE_URL } from "./site";

/**
 * Search-facing text for a single test.
 *
 * Everything here is built from fields the database already has — title,
 * question_types, passage, total — because that is the material students
 * actually search for ("Life on Mars IELTS reading answers").
 *
 * HISTORY, because this reversed a documented decision. This file used to say
 * the passage body was deliberately excluded: it is Cambridge copy, the same
 * text sits on dozens of sites, so republishing it is both a copyright exposure
 * and duplicate content Google will discount. Both halves of that are still
 * true, and the owner weighed them and chose to publish anyway — the page had
 * 103 indexable words and could not rank for the queries it exists to serve.
 * The passage, key and explanations are rendered by `TestSeoContent`; the gate
 * deciding what may be published lives in `lib/seo/test-seo-data.ts`.
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
export function testDescription(t: SeoTest, passageNames: string[] = []): string {
  const noun = t.skill === "reading" ? "Reading passage" : "Listening test";

  // A full test is stored under a shelf label — "Volume 7, Test 1" — which
  // nobody searches for. Its three passages have the names students DO type
  // ("carnivorous plant ielts reading answers"), so when they are known they
  // lead, and the shelf label follows for the students who do use it.
  if (passageNames.length > 1) {
    const names = passageNames.join(", ");
    const head = `${names} — IELTS Reading passages with answers and explanations.`;
    const tail = ` ${t.title}${t.total ? ` · ${t.total} questions` : ""}. Free online practice.`;
    return clampDescription(head, tail);
  }

  // "answers" and "passage" go in the FIRST clause, not the last: the tail is
  // what gets cut, and those are the words students actually search for.
  const head = `${t.title} — IELTS ${noun} with answers and explanations.`;

  const bits: string[] = [testFormat(t)];
  if (t.total && t.total > 0) bits.push(`${t.total} questions`);
  const types = (t.question_types ?? []).filter(Boolean).slice(0, 2);
  if (types.length) bits.push(types.join(", "));

  const tail = ` ${bits.join(" · ")}. Free online practice.`;
  return clampDescription(head, tail);
}

/**
 * Fits `head + tail` into what Google will show, dropping the tail first.
 *
 * Trimmed on a word boundary — an earlier cap sliced mid-word ("explana…"),
 * which reads as a broken page in the result.
 */
function clampDescription(head: string, tail: string): string {
  const full = head + tail;
  if (full.length <= 160) return full;
  if (head.length <= 160) return head;
  return `${head.slice(0, 157).replace(/\s+\S*$/, "")}…`;
}

/** Absolute canonical URL for a test, always on the canonical host. */
export function testCanonical(t: Pick<SeoTest, "id" | "skill">): string {
  return `${SITE_URL}/${t.skill}/${t.id}`;
}

/* -------------------------------------------------------------------------- */
/* FAQ                                                                         */
/* -------------------------------------------------------------------------- */

export type Faq = { q: string; a: string };

/**
 * The questions students type as questions.
 *
 * A page ranks for the phrasings its text contains, and "<name> ielts reading
 * answers" is only one of them — "what are the answers to <name>", "how many
 * questions", "is <name> reading hard" are all separate searches for the same
 * page. Writing them out once, in the words students use, is what lets one page
 * serve all of them; it is also what earns the FAQ rich result.
 *
 * Every answer here is TRUE OF THIS TEST, generated from its own row. Inventing
 * plausible-sounding FAQ text would be the fastest way to lose the rich result
 * and the trust behind it.
 */
export function faqForTest(t: SeoTest, opts: { hasAnswers: boolean }): Faq[] {
  const noun = t.skill === "reading" ? "reading" : "listening";
  const out: Faq[] = [];

  if (opts.hasAnswers) {
    out.push({
      q: `What are the answers to ${t.title}?`,
      a:
        `The full answer key for ${t.title} is on this page — open “Show the answer key” above. ` +
        `${SITE_NAME} also marks the test automatically the moment you submit, so you get a band ` +
        `score and see exactly which questions you got wrong.`,
    });
  }

  if (t.total && t.total > 0) {
    const minutes = t.kind === "full" ? 60 : t.skill === "reading" ? 20 : 30;
    out.push({
      q: `How many questions are in ${t.title}?`,
      a:
        `${t.title} has ${t.total} questions${
          t.question_types?.length ? ` (${t.question_types.join(", ")})` : ""
        }. In the real exam you would spend about ${minutes} minutes on it.`,
    });
  }

  out.push({
    q: `Is ${t.title} free to practise?`,
    a:
      t.tier === "premium"
        ? `${t.title} is part of ${SITE_NAME} Premium. The passage and answers are on this page; sitting the timed test and getting a marked band score needs a Premium account.`
        : `Yes. ${t.title} is free on ${SITE_NAME}, and you can sit it without creating an account. ` +
          `An account only adds saved scores and band tracking over time.`,
  });

  out.push({
    q: `Is this the real IELTS ${noun} test format?`,
    a:
      `Yes — it runs in the same computer-delivered interface as the real exam, with the same ` +
      `question types and timing, and it is marked to the official IELTS band scale.`,
  });

  return out;
}

/** schema.org FAQPage — what produces the expandable Q&A in a search result. */
export function faqJsonLd(faqs: Faq[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

/**
 * schema.org BreadcrumbList.
 *
 * Turns the grey URL under a search result into "MockOnline › Reading ›
 * <passage>", which both reads better and tells Google how the catalogue nests
 * — worth having when 190 test pages are each linked from only one listing.
 */
export function breadcrumbJsonLd(t: SeoTest): Record<string, unknown> {
  const skillName = t.skill === "reading" ? "IELTS Reading" : "IELTS Listening";
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: SITE_NAME, item: SITE_URL },
      { "@type": "ListItem", position: 2, name: skillName, item: `${SITE_URL}/${t.skill}` },
      { "@type": "ListItem", position: 3, name: t.title, item: testCanonical(t) },
    ],
  };
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
