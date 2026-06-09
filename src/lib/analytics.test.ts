import { describe, it, expect } from "vitest";
import { computeTypeStats, weakestType } from "./analytics";

const tests = [
  { id: "a", question_types: ["Matching headings", "True/False/Not Given"] },
  { id: "b", question_types: ["Matching headings"] },
  { id: "c", question_types: ["Summary completion"] },
];

describe("computeTypeStats", () => {
  it("attributes a test's accuracy to each of its types, weakest first", () => {
    const results = [
      { test_id: "a", skill: "reading", raw: 5, total: 10 }, // 50%
      { test_id: "b", skill: "reading", raw: 3, total: 10 }, // 30%
      { test_id: "c", skill: "reading", raw: 9, total: 10 }, // 90%
    ];
    const stats = computeTypeStats(results, tests);
    const byType = Object.fromEntries(stats.map((s) => [s.type, s]));

    // Matching headings appears in a (5/10) and b (3/10) => 8/20 = 40%, 2 tests.
    expect(byType["Matching headings"].accuracy).toBe(40);
    expect(byType["Matching headings"].tests).toBe(2);
    expect(byType["True/False/Not Given"].accuracy).toBe(50);
    expect(byType["Summary completion"].accuracy).toBe(90);

    // Sorted weakest first.
    expect(stats[0].type).toBe("Matching headings");
  });

  it("ignores other skills, untagged tests, and zero-total rows", () => {
    const results = [
      { test_id: "a", skill: "listening", raw: 1, total: 10 },
      { test_id: "z", skill: "reading", raw: 1, total: 10 }, // unknown test
      { test_id: "c", skill: "reading", raw: 0, total: 0 }, // no questions
    ];
    expect(computeTypeStats(results, tests)).toEqual([]);
  });
});

describe("weakestType", () => {
  it("prefers a type with >=2 tests of signal", () => {
    const stats = [
      { type: "One-off", accuracy: 10, tests: 1 },
      { type: "Repeated", accuracy: 30, tests: 3 },
    ];
    expect(weakestType(stats)?.type).toBe("Repeated");
  });

  it("falls back to the single weakest when nothing has 2+ tests", () => {
    const stats = [{ type: "Solo", accuracy: 20, tests: 1 }];
    expect(weakestType(stats)?.type).toBe("Solo");
  });

  it("returns null with no data", () => {
    expect(weakestType([])).toBeNull();
  });
});
