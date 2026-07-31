import { describe, it, expect } from "vitest";
import {
  sanitizeTestHtml,
  findUnstrippedLiterals,
  SanitizeIncompleteError,
} from "./sanitize-test-html";

// The guard that makes sanitizing fail CLOSED.
//
// These cases are synthetic on purpose: no file in the library triggers them
// today (the whole X:\CDI READING PROJECT set was swept and comes out clean),
// and that is exactly why they need a test. The failure mode is silent — the
// key survives into the served HTML while /api/test-html believes it stripped
// the file and audit-answer-keys.mjs still passes, because that script only
// inspects the database column and never the bytes that go out.

const page = (body: string) => `<html><body><script>${body}</script></body></html>`;
const ORIGIN = "https://example.test";
const ID = "11111111-2222-3333-4444-555555555555";

describe("findUnstrippedLiterals", () => {
  it("is empty for html the stripper handled", () => {
    const out = sanitizeTestHtml(
      page(`const correctAnswers = { 1:'TRUE' }; const evidence = { 1:{para:'para-1'} };`),
      ORIGIN,
      ID,
    );
    expect(findUnstrippedLiterals(out)).toEqual([]);
    expect(out).toContain("correctAnswers = {}");
    expect(out).toContain("evidence = {}");
  });

  it("reports a literal the brace walk could not close", () => {
    // An apostrophe inside a comment flips the walker into string mode, so the
    // closing brace is never found and the strip leaves the object alone.
    const src = `const correctAnswers = { /* don't touch */ 1:'TRUE', 2:'FALSE' };`;
    expect(findUnstrippedLiterals(src)).toContain("correctAnswers");
  });

  it("catches a SECOND declaration the first pass already blanked past", () => {
    const src = `const evidence = {}; var evidence = { 1:{para:'para-1'} };`;
    expect(findUnstrippedLiterals(src)).toContain("evidence");
  });

  it("ignores the identifier as a property or a longer name", () => {
    const src = `const STORAGE_KEY = { a:1 }; obj.evidence = { b:2 };`;
    expect(findUnstrippedLiterals(src)).toEqual([]);
  });
});

describe("sanitizeTestHtml fails closed", () => {
  it("throws rather than serving html that still contains a key", () => {
    const src = page(`const KEY = { /* don't */ 1:'A' };`);
    expect(() => sanitizeTestHtml(src, ORIGIN, ID)).toThrow(SanitizeIncompleteError);
    try {
      sanitizeTestHtml(src, ORIGIN, ID);
    } catch (e) {
      expect((e as SanitizeIncompleteError).idents).toEqual(["KEY"]);
    }
  });

  it("does not throw for a file with no sensitive literals at all", () => {
    expect(() => sanitizeTestHtml(page(`var x = 1;`), ORIGIN, ID)).not.toThrow();
  });
});
