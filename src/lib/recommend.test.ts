import { describe, expect, it } from "vitest";
import { lockedForWeakType, recommendForWeakType } from "./recommend";

const T = (id: string, over: Partial<{ tier: string; question_types: string[]; difficulty: number }> = {}) => ({
  id,
  tier: "free",
  question_types: ["Matching headings"],
  difficulty: 1500,
  ...over,
});

const base = { attempted: new Set<string | null>(), weakType: null, canOpenPremium: false, rating: 1000 };

describe("recommendForWeakType", () => {
  it("drops attempted tests", () => {
    const out = recommendForWeakType([T("a"), T("b")], { ...base, attempted: new Set(["a"]) });
    expect(out.map((t) => t.id)).toEqual(["b"]);
  });

  it("hides premium tests from a free student and shows them to a member", () => {
    const tests = [T("free"), T("paid", { tier: "premium" })];
    expect(recommendForWeakType(tests, base).map((t) => t.id)).toEqual(["free"]);
    expect(recommendForWeakType(tests, { ...base, canOpenPremium: true }).map((t) => t.id)).toEqual([
      "free",
      "paid",
    ]);
  });

  it("keeps only tests carrying the weak type", () => {
    const tests = [T("a"), T("b", { question_types: ["True/False/Not Given"] }), T("c", { question_types: [] })];
    const out = recommendForWeakType(tests, { ...base, weakType: "True/False/Not Given" });
    expect(out.map((t) => t.id)).toEqual(["b"]);
  });

  it("orders by closeness to the rating and respects the limit", () => {
    const tests = [T("far", { difficulty: 1900 }), T("near", { difficulty: 1050 }), T("mid", { difficulty: 1300 })];
    expect(recommendForWeakType(tests, base).map((t) => t.id)).toEqual(["near", "mid", "far"]);
    expect(recommendForWeakType(tests, { ...base, limit: 1 }).map((t) => t.id)).toEqual(["near"]);
  });

  it("treats a missing tier as free and a missing difficulty as 1500", () => {
    const out = recommendForWeakType([{ id: "x" }], { ...base, rating: 1500 });
    expect(out.map((t) => t.id)).toEqual(["x"]);
  });
});

describe("lockedForWeakType", () => {
  const tests = [
    T("free"),
    T("paid-far", { tier: "premium", difficulty: 1900 }),
    T("paid-near", { tier: "premium", difficulty: 1100 }),
    T("paid-other", { tier: "premium", question_types: ["Summary completion"], difficulty: 1000 }),
  ];

  it("names the closest premium test of the weak type", () => {
    expect(lockedForWeakType(tests, { ...base, weakType: "Matching headings" })?.id).toBe("paid-near");
  });

  it("is null for a member, and null with no weak type", () => {
    expect(lockedForWeakType(tests, { ...base, weakType: "Matching headings", canOpenPremium: true })).toBeNull();
    expect(lockedForWeakType(tests, base)).toBeNull();
  });

  it("skips a premium test already attempted", () => {
    const out = lockedForWeakType(tests, {
      ...base,
      weakType: "Matching headings",
      attempted: new Set(["paid-near"]),
    });
    expect(out?.id).toBe("paid-far");
  });
});
