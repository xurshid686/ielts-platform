// Infers which IELTS question types a reading test contains, by reading the
// rubric wording in its CDI HTML.
//
// Why this exists: 86 of the 121 reading tests carried NO question types at all
// (`question_types` is populated only by the admin upload form's checkboxes, and
// the premium batch script never set it). That left the catalogue's question-type
// filter covering 29% of the library, and the dashboard's "weakest type"
// recommendation drawing from that same sliver.
//
// The rubric lines in an IELTS paper are near-verbatim across Cambridge volumes
// ("Do the following statements agree with the information given in...",
// "Choose the correct letter, A, B, C or D"), which makes them a reliable
// classifier — far more reliable than guessing from the input markup, since the
// same <input> renders for several different question types.
//
// Shared deliberately between scripts/backfill-question-types.mjs and the admin
// review UI so both agree on what a test contains.

import { QUESTION_TYPES } from "./question-types";

export type InferredTypes = {
  types: string[];
  /** Rubrics that matched but could not be resolved to a single type. */
  ambiguous: string[];
  /** True when a human should look at this before it is trusted. */
  needsReview: boolean;
};

/**
 * Strips scripts, styles and tags so the rubric text can be matched without
 * hitting the answer key or the CDI's own JS (which mentions type names in
 * comments and would produce false positives).
 */
export function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ");
}

// Each rule maps a rubric pattern to a canonical type name. Order does not
// matter — every rule is tested and all matches are collected, because a single
// reading passage routinely mixes three or four question types.
// The wording variants below were harvested from all 121 stored reading files
// rather than assumed — e.g. "Choose the correct ANSWER, A, B, C or D" appears
// alongside the commoner "Choose the correct LETTER", and matching-features
// papers phrase it either as a "list of people" or as "match each statement
// with the correct person".
const RULES: { type: string; test: RegExp }[] = [
  { type: "Multiple choice", test: /choose the correct (?:letter|answer)/i },
  { type: "Multiple choice", test: /choose\s+(?:TWO|THREE|\d)\s+letters/i },
  { type: "Matching headings", test: /list of headings|choose the (?:correct|most suitable) heading/i },
  { type: "Matching information", test: /which (?:paragraph|section) contains the following information/i },
  // Matching-features papers phrase the pairing three ways, and the "list of X"
  // noun varies freely (people, theories, activities, researchers…), so match
  // the SHAPE of the rubric rather than enumerating nouns.
  { type: "Matching features", test: /look at the following[\s\S]{0,80}?\band the list of\b/i },
  { type: "Matching features", test: /\bmatch each\b[\s\S]{0,60}?\bwith the\b/i },
  { type: "Matching features", test: /list of (?:people|researchers|scientists|writers|features|places|companies|countries|theories|activities|statements)\b/i },
  { type: "Matching sentence endings", test: /complete each sentence with the correct ending/i },
  { type: "Summary completion", test: /complete the summary/i },
  { type: "Sentence completion", test: /complete the sentences\b/i },
  // "flow chart" (space) is as common as "flow-chart" in these papers.
  { type: "Note/Table/Flow-chart completion", test: /complete the (?:notes|table|flow[\s-]?chart)/i },
  { type: "Diagram label completion", test: /label the diagram/i },
  { type: "Short-answer questions", test: /answer the questions below/i },
];

// True/False/Not Given and Yes/No/Not Given share the stem "Do the following
// statements agree with...", so the stem alone cannot separate them.
// "information given" is the TFNG phrasing; "views/claims of the writer" is YNNG.
const AGREE_STEM = /do the following statements agree with/i;
const TFNG_STEM = /agree with the information given/i;
const YNNG_STEM = /agree with the (?:views|claims)/i;

// Some CDI builds rewrite the rubric entirely ("choose NO if the statement
// contradicts ... NOT GIVEN if there is no information"), losing the stem. The
// answer-token triad survives that rewrite, so it is checked independently
// rather than only as a fallback inside the stem branch.
//
// `\bNO\b(?!\s+MORE)` matters: "NO MORE THAN TWO WORDS" appears on almost every
// completion task and would otherwise mark the whole library as Yes/No/Not Given.
const NOT_GIVEN = /\bNOT GIVEN\b/i;
const TFNG_TOKENS = /\bTRUE\b/i;
const YNNG_TOKENS = /\bYES\b/i;
const NO_TOKEN = /\bNO\b(?!\s+MORE)/i;
const FALSE_TOKEN = /\bFALSE\b/i;

/**
 * Classifies a reading test from its HTML. Accepts the raw file — stripping is
 * done here so callers cannot forget it.
 */
/**
 * True when the file lays answer inputs out inside a <table> or a notes/form
 * block. On its own this is NOT enough to tag a test — plenty of papers use
 * tables purely for layout — but combined with the absence of a
 * "Complete the notes/table" rubric it is a good reason to ask a human to look.
 */
function hasTabularAnswerLayout(html: string): boolean {
  const tables = html.match(/<table[\s\S]*?<\/table>/gi) ?? [];
  return tables.some((t) => /<input[^>]*name="q\d+"/i.test(t));
}

export function inferQuestionTypes(html: string): InferredTypes {
  const text = visibleText(html);
  const found = new Set<string>();
  const ambiguous: string[] = [];

  for (const { type, test } of RULES) {
    if (test.test(text)) found.add(type);
  }

  // The stem, when present, is the most reliable signal.
  const byStem = (TFNG_STEM.test(text) ? 1 : 0) + (YNNG_STEM.test(text) ? 2 : 0);
  if (byStem & 1) found.add("True/False/Not Given");
  if (byStem & 2) found.add("Yes/No/Not Given");

  // Independently, look for the answer tokens. This catches builds whose rubric
  // was rewritten, and adds a second type to papers that carry both tasks.
  if (NOT_GIVEN.test(text)) {
    if (TFNG_TOKENS.test(text) && FALSE_TOKEN.test(text)) found.add("True/False/Not Given");
    if (YNNG_TOKENS.test(text) && NO_TOKEN.test(text)) found.add("Yes/No/Not Given");
  }

  // A statements-agree paper we could not resolve either way needs a human.
  if (
    AGREE_STEM.test(text) &&
    !found.has("True/False/Not Given") &&
    !found.has("Yes/No/Not Given")
  ) {
    ambiguous.push("statements-agree rubric with no TRUE/FALSE or YES/NO tokens");
  }

  // Answers laid out in a table, but no note/table rubric found — either the
  // rubric is phrased unusually or the table is only layout. Worth a look.
  if (!found.has("Note/Table/Flow-chart completion") && hasTabularAnswerLayout(html)) {
    ambiguous.push("answer inputs sit inside a table but no note/table rubric matched");
  }

  // Guard against drift: never emit a string the catalogue filter doesn't know.
  const canonical = new Set(QUESTION_TYPES.reading);
  const types = [...found].filter((t) => canonical.has(t)).sort(
    (a, b) => QUESTION_TYPES.reading.indexOf(a) - QUESTION_TYPES.reading.indexOf(b),
  );

  return {
    types,
    ambiguous,
    // Nothing found, or a rubric we could not resolve, means a human should look.
    needsReview: types.length === 0 || ambiguous.length > 0,
  };
}
