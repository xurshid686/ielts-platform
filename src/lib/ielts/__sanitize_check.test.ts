import { existsSync, readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { sanitizeTestHtml, extractSensitiveLiterals } from "./sanitize-test-html";
import { extractAnswerKey } from "./extract-key";
import { gradeAnswers, asAnswerKey } from "./grade";

// This suite validates the sanitizer against a real CDI reading test. The
// fixture lives outside the repo, so the suite skips gracefully where it's absent.
const SRC = "X:\\CDI READING PROJECT\\Orientation of birds Passage 2 by codex.html";
const ORIGIN = "https://example.test";
const TEST_ID = "11111111-2222-3333-4444-555555555555";

describe.skipIf(!existsSync(SRC))("sanitizeTestHtml (real CDI file)", () => {
  const raw = readFileSync(SRC, "utf8");
  const out = sanitizeTestHtml(raw, ORIGIN, TEST_ID);

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

  it("removes the download tooling and injects the sanitized bridge", () => {
    expect(out.toLowerCase()).not.toContain("html2pdf.bundle");
    expect(out).toContain("IELTS Platform sanitized bridge");
  });

  it("targets postMessage at the site origin, never a wildcard", () => {
    expect(out).toContain(`var TARGET_ORIGIN = "${ORIGIN}"`);
    expect(out).not.toContain("__ORIGIN__");
  });

  it("carries the test id so the bridge can fetch the key back after submit", () => {
    expect(out).toContain(`var TEST_ID = "${TEST_ID}"`);
    expect(out).not.toContain("__TEST_ID__");
  });

  it("captures the stripped literals so the results screen can be restored", () => {
    const lit = extractSensitiveLiterals(raw);
    // This file is the X:\ CDI generation: correctAnswers + acceptableAnswers +
    // explanations + evidence.
    expect(Object.keys(lit).sort()).toEqual([
      "acceptableAnswers",
      "correctAnswers",
      "evidence",
      "explanations",
    ]);

    // Each body must be valid JS that evaluates back to the original data —
    // that is exactly what the injected bridge does with it in the browser.
    const evalLit = (src: string) => new Function("return (" + src + ")")();
    const answers = evalLit(lit.correctAnswers) as Record<string, unknown>;
    const original = extractAnswerKey(raw)!;
    expect(Object.keys(answers).sort()).toEqual(Object.keys(original.key).sort());

    const ev = evalLit(lit.evidence) as Record<string, { para?: string; snippet?: string }>;
    const first = ev[Object.keys(ev)[0]];
    expect(first.para).toMatch(/^para-/);
    expect(typeof first.snippet).toBe("string");

    // The evidence snippet must genuinely occur in the passage, or highlighting
    // it after submit would silently do nothing.
    expect(raw).toContain(first.snippet!);
  });

  it("returns nothing for a file that was already stripped", () => {
    expect(extractSensitiveLiterals(out)).toEqual({});
  });

  it("keeps every inline script syntactically valid (no parser breakage)", () => {
    // Regression guard: a bad rewrite (e.g. html2pdf() -> `void 0.set(...)`,
    // where `0.` is a number literal) is a SyntaxError that kills the whole
    // script and disables the test. new Function() parses without running.
    const scripts = [...out.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(
      (m) => m[1],
    );
    expect(scripts.length).toBeGreaterThan(0);
    for (const code of scripts) {
      expect(() => new Function(code)).not.toThrow();
    }
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
