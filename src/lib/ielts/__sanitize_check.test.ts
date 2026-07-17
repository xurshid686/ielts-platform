import { existsSync, readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { sanitizePublicTestHtml } from "./sanitize-public";
import { extractAnswerKey } from "./extract-key";
import { gradeAnswers, asAnswerKey } from "./grade";

// This suite validates the public sanitizer against a real CDI reading test. The
// fixture lives outside the repo, so the suite skips gracefully where it's absent.
const SRC = "X:\\CDI READING PROJECT\\Orientation of birds Passage 2 by codex.html";

describe.skipIf(!existsSync(SRC))("sanitizePublicTestHtml (real CDI file)", () => {
  const raw = readFileSync(SRC, "utf8");
  const out = sanitizePublicTestHtml(raw);

  it("strips the answer key + model answers from the served HTML", () => {
    // The literal DECLARATIONS remain (so the test's JS still parses) but must be empty.
    expect(out).toContain("correctAnswers = {}");
    expect(out).toContain("acceptableAnswers = {}");
    expect(out).toContain("explanations = {}");
    expect(out).toContain("evidence = {}");
    // The answer-key MAPPING / model answers must be gone. (Individual answer
    // words like "visual memory" are lifted from the passage, so they legitimately
    // remain in the passage text — what must not survive is the mapping itself.)
    expect(out).not.toContain("15:'migration direction'"); // correctAnswers entry
    expect(out).not.toContain("'laysan albatross','albatross'"); // acceptableAnswers variants
    expect(out).not.toContain("para:'para-"); // evidence objects
    expect(out).not.toContain("Paragraph C: Such birds"); // explanation text (not in passage)
  });

  it("removes the download tooling and injects the public bridge", () => {
    expect(out.toLowerCase()).not.toContain("html2pdf.bundle");
    expect(out).toContain("IELTS Platform public bridge");
  });

  it("still exposes the questions/passage so the test renders", () => {
    expect(out).toContain("deliver-button");
    expect(out).toContain('name="q14"'); // first question input survives
  });

  it("server can still grade from the extracted key (parity check)", () => {
    // The key is extracted from the ORIGINAL html at upload time and stored;
    // grading the correct answers must yield a perfect score.
    const ex = extractAnswerKey(raw);
    expect(ex).not.toBeNull();
    const key = asAnswerKey(ex!.key)!;
    const perfect: Record<string, string> = {};
    for (const [q, variants] of Object.entries(ex!.key)) perfect[q] = variants[0];
    const graded = gradeAnswers(key, perfect);
    expect(graded.raw).toBe(ex!.total);
    expect(graded.total).toBe(13);
  });
});
