import { describe, expect, it } from "vitest";
import { categoriesFor, cleanReport, rateLimitError, REPORTS_PER_DAY } from "./test-reports-shared";

describe("cleanReport", () => {
  it("accepts a normal report", () => {
    expect(cleanReport({ category: "wrong_answer", question: " 14 ", message: "  Key says B, passage says C  " })).toEqual({
      ok: true,
      value: { category: "wrong_answer", question: "14", message: "Key says B, passage says C" },
    });
  });
  it("normalises question ranges", () => {
    const r = cleanReport({ category: "layout", question: "14 – 17", message: "boxes are shifted" });
    expect(r.ok && r.value.question).toBe("14-17");
    const r2 = cleanReport({ category: "layout", question: "", message: "boxes are shifted" });
    expect(r2.ok && r2.value.question).toBe(null);
  });
  it("refuses bad input", () => {
    expect(cleanReport({ category: "spam", message: "hello world" }).ok).toBe(false);
    expect(cleanReport({ category: "other", message: "hi" }).ok).toBe(false);
    expect(cleanReport({ category: "other", message: "x".repeat(1001) }).ok).toBe(false);
    expect(cleanReport({ category: "other", question: "Q14", message: "hello world" }).ok).toBe(false);
    expect(cleanReport({ category: "other", question: "41", message: "hello world" }).ok).toBe(false);
  });
});

describe("categoriesFor", () => {
  it("offers Audio only for listening", () => {
    expect(categoriesFor("reading").some((c) => c.id === "audio")).toBe(false);
    expect(categoriesFor("listening").some((c) => c.id === "audio")).toBe(true);
  });
});

describe("rateLimitError", () => {
  it("limits per day and per test", () => {
    expect(rateLimitError(0, 0)).toBe(null);
    expect(rateLimitError(REPORTS_PER_DAY, 0)).toMatch(/tomorrow/);
    expect(rateLimitError(1, 1)).toMatch(/few minutes/);
  });
});
