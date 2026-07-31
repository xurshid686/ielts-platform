import { describe, it, expect } from "vitest";
import { inferQuestionTypes, visibleText } from "./infer-question-types";
import { QUESTION_TYPES } from "./question-types";

// Rubric wording lifted from real Cambridge papers. These are unit tests over
// the classifier itself — the whole-library check lives in the backfill script's
// --dry-run, which reports every classification for review before writing.

function page(...rubrics: string[]) {
  return `<html><body>${rubrics.map((r) => `<p>${r}</p>`).join("")}</body></html>`;
}

describe("inferQuestionTypes", () => {
  it("reads True/False/Not Given from the 'information given' stem", () => {
    const r = inferQuestionTypes(
      page("Do the following statements agree with the information given in Reading Passage 1?", "Write TRUE, FALSE or NOT GIVEN."),
    );
    expect(r.types).toContain("True/False/Not Given");
    expect(r.types).not.toContain("Yes/No/Not Given");
    expect(r.needsReview).toBe(false);
  });

  it("reads Yes/No/Not Given from the 'views of the writer' stem", () => {
    const r = inferQuestionTypes(
      page("Do the following statements agree with the views of the writer in Reading Passage 2?", "Write YES, NO or NOT GIVEN."),
    );
    expect(r.types).toContain("Yes/No/Not Given");
    expect(r.types).not.toContain("True/False/Not Given");
  });

  it("tags both when a paper genuinely contains both stems", () => {
    const r = inferQuestionTypes(
      page(
        "Do the following statements agree with the information given in Reading Passage 1?",
        "Do the following statements agree with the claims of the writer?",
      ),
    );
    expect(r.types).toEqual(expect.arrayContaining(["True/False/Not Given", "Yes/No/Not Given"]));
  });

  it("falls back to answer tokens when the stem is inconclusive", () => {
    const r = inferQuestionTypes(page("Do the following statements agree with the passage?", "Write YES or NO or NOT GIVEN"));
    expect(r.types).toContain("Yes/No/Not Given");
  });

  it("flags an unresolvable agree-rubric for review instead of guessing", () => {
    const r = inferQuestionTypes(page("Do the following statements agree with the passage?"));
    expect(r.types).toHaveLength(0);
    expect(r.needsReview).toBe(true);
    expect(r.ambiguous).toHaveLength(1);
  });

  it("recognises the common completion and matching rubrics", () => {
    const cases: [string, string][] = [
      ["Choose the correct letter, A, B, C or D.", "Multiple choice"],
      ["Reading Passage 1 has seven paragraphs. Choose the correct heading for each.", "Matching headings"],
      ["Which paragraph contains the following information?", "Matching information"],
      ["Complete the summary below.", "Summary completion"],
      ["Complete the sentences below.", "Sentence completion"],
      ["Complete the notes below.", "Note/Table/Flow-chart completion"],
      ["Complete the table below.", "Note/Table/Flow-chart completion"],
      ["Complete the flow-chart below.", "Note/Table/Flow-chart completion"],
      ["Label the diagram below.", "Diagram label completion"],
      ["Answer the questions below.", "Short-answer questions"],
      ["Complete each sentence with the correct ending, A-F.", "Matching sentence endings"],
      ["Look at the following statements and the list of researchers below.", "Matching features"],
    ];
    for (const [rubric, expected] of cases) {
      expect(inferQuestionTypes(page(rubric)).types, rubric).toContain(expected);
    }
  });

  it("collects every type on a multi-section paper", () => {
    const r = inferQuestionTypes(
      page(
        "Do the following statements agree with the information given?",
        "Write TRUE, FALSE or NOT GIVEN.",
        "Choose the correct letter, A, B, C or D.",
        "Complete the summary below.",
      ),
    );
    expect(r.types).toEqual([
      "Multiple choice",
      "True/False/Not Given",
      "Summary completion",
    ]);
    expect(r.needsReview).toBe(false);
  });

  it("recognises a rewritten rubric that lost the standard stem", () => {
    // Some CDI builds paraphrase: no "Do the following statements agree..." line
    // survives, only the answer tokens.
    const r = inferQuestionTypes(
      page(
        "Choose YES if the statement agrees, choose NO if the statement contradicts the information, or choose NOT GIVEN if there is no information on this.",
        "Choose the correct answer.",
        "Complete the summary using the list of words.",
      ),
    );
    expect(r.types).toEqual(
      expect.arrayContaining(["Multiple choice", "Yes/No/Not Given", "Summary completion"]),
    );
    expect(r.needsReview).toBe(false);
  });

  it("does NOT read 'NO MORE THAN TWO WORDS' as a Yes/No/Not Given paper", () => {
    // This phrase sits on almost every completion task; a naive \bNO\b would
    // have tagged the entire library Yes/No/Not Given.
    const r = inferQuestionTypes(
      page(
        "Complete the notes below.",
        "Choose NO MORE THAN TWO WORDS from the passage for each answer.",
        "Do the following statements agree with the information given?",
        "Write TRUE, FALSE or NOT GIVEN.",
      ),
    );
    expect(r.types).toContain("True/False/Not Given");
    expect(r.types).not.toContain("Yes/No/Not Given");
  });

  it("accepts 'Choose the correct answer' as multiple choice, not just 'letter'", () => {
    expect(inferQuestionTypes(page("Choose the correct answer, A, B, C or D.")).types).toContain(
      "Multiple choice",
    );
  });

  it("accepts both matching-features phrasings", () => {
    expect(inferQuestionTypes(page("Match each statement with the correct person, A-E.")).types).toContain(
      "Matching features",
    );
    expect(inferQuestionTypes(page("Look at the following statements and the list of people below.")).types).toContain(
      "Matching features",
    );
  });

  it("only ever emits canonical type names", () => {
    const r = inferQuestionTypes(page("Choose the correct letter", "Complete the summary below."));
    for (const t of r.types) expect(QUESTION_TYPES.reading).toContain(t);
  });

  it("ignores rubric-like text inside <script>, so the CDI's own JS can't fool it", () => {
    const html = `<html><body><script>var help = "Choose the correct letter, A, B, C or D";</script><p>Complete the summary below.</p></body></html>`;
    const r = inferQuestionTypes(html);
    expect(r.types).toEqual(["Summary completion"]);
  });

  it("strips markup and entities", () => {
    expect(visibleText("<p>a&nbsp;<b>b</b></p>")).toBe(" a b ");
  });
});
