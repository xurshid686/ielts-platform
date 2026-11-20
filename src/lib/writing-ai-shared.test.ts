import { describe, expect, it } from "vitest";
import {
  MONTHLY_CHECKS,
  ULTIMA_MONTHLY_CHECKS,
  asResults,
  buildCriteria,
  criterionLabel,
  draftBands,
  draftFeedbackText,
  monthKey,
  monthlyLimitFor,
  overallFromCriteria,
  parseBand,
  quotaOf,
  renewsOn,
  roundHalf,
  withoutBands,
} from "./writing-ai-shared";

// The shape Axiom really returned (verified 2026-11-14): scores are STRINGS,
// Task 1 returned "8.0" while a short Task 2 returned "4", and some criteria have
// Suggestions, others Revisions.
const axiom = {
  Cohesion_and_Coherence: { Score: "8.0", Description: "Clear.", Suggestions: ["Link more."], Revisions: [{ sentenceExample: "A.", revision: "B." }] },
  Lexical_Resource: { Score: "7.0", Description: "Varied.", Revisions: [] },
  Grammatical_Range_and_Accuracy: { Score: "8.0", Description: "Accurate." },
  Task_Achievement: { Score: "8.0", Description: "Complete.", Suggestions: ["Add detail."] },
};

describe("monthly check allowance", () => {
  it("is 10 for Premium and 20 for Ultima", () => {
    expect(monthlyLimitFor(false)).toBe(10);
    expect(monthlyLimitFor(true)).toBe(20);
    expect(ULTIMA_MONTHLY_CHECKS).toBeGreaterThan(MONTHLY_CHECKS);
  });
  it("quotaOf reports the Ultima limit when given it", () => {
    expect(quotaOf(3, "2026-11", monthlyLimitFor(true)).left).toBe(17);
    expect(quotaOf(3, "2026-11", monthlyLimitFor(false)).left).toBe(7);
  });
});

describe("parseBand", () => {
  it("reads Axiom's string scores", () => {
    expect(parseBand("8.0")).toBe(8);
    expect(parseBand("4")).toBe(4);
    expect(parseBand(7.5)).toBe(7.5);
  });
  it("refuses junk and out-of-range values", () => {
    expect(parseBand("")).toBeNull();
    expect(parseBand("n/a")).toBeNull();
    expect(parseBand(undefined)).toBeNull();
    expect(parseBand("10")).toBeNull();
    expect(parseBand(-1)).toBeNull();
  });
});

describe("roundHalf", () => {
  it("rounds to the nearest half band", () => {
    expect(roundHalf(6.2)).toBe(6);
    expect(roundHalf(6.3)).toBe(6.5);
    expect(roundHalf(6.75)).toBe(7);
    expect(roundHalf(7)).toBe(7);
  });
});

describe("buildCriteria", () => {
  it("always returns four criteria in IELTS order, labelled for the task", () => {
    const c = buildCriteria(2, axiom);
    expect(c.map((x) => x.key)).toEqual(["ta", "cc", "lr", "gra"]);
    expect(c[0].label).toBe("Task Response");
    expect(buildCriteria(1, axiom)[0].label).toBe("Task Achievement");
    expect(c[1]).toMatchObject({ band: 8, suggestions: ["Link more."], revisions: [{ original: "A.", revised: "B." }] });
  });
  it("keeps a missing criterion as a null-band row instead of dropping it", () => {
    const c = buildCriteria(1, { Task_Achievement: { Score: "6.5", Description: "ok" } });
    expect(c).toHaveLength(4);
    expect(c[0].band).toBe(6.5);
    expect(c[2]).toMatchObject({ band: null, description: "", revisions: [] });
  });
  it("survives null / garbage input", () => {
    expect(buildCriteria(2, null).every((c) => c.band === null)).toBe(true);
    expect(buildCriteria(2, { Lexical_Resource: "oops" }).length).toBe(4);
  });
});

describe("overallFromCriteria", () => {
  it("averages to the nearest half", () => {
    expect(overallFromCriteria(buildCriteria(2, axiom))).toBe(8); // (8+8+7+8)/4 = 7.75 -> 8
  });
});

describe("draftBands / draftFeedbackText", () => {
  const results = [
    { task: 1 as const, axiomId: "a", overall: 7.5, criteria: buildCriteria(1, axiom) },
    { task: 2 as const, axiomId: "b", overall: 6.25, criteria: buildCriteria(2, axiom) },
  ];
  it("pre-fills each task's overall rounded to a half band", () => {
    expect(draftBands(results)).toEqual({ task1: 7.5, task2: 6.5 });
  });
  it("returns null for a task that was not checked", () => {
    expect(draftBands([results[0]])).toEqual({ task1: 7.5, task2: null });
  });
  it("falls back to the criteria mean when Axiom gave no overall", () => {
    const r = [{ ...results[1], overall: null }];
    expect(draftBands(r).task2).toBe(8); // mean 7.75 -> 8
  });
  it("builds readable feedback and respects the length cap", () => {
    const t = draftFeedbackText(results);
    expect(t).toContain("Task 1");
    expect(t).toContain("Task Response: Complete.");
    expect(t).toContain("  - Add detail.");
    expect(draftFeedbackText(results, 40).length).toBeLessThanOrEqual(40);
  });
});

describe("withoutBands", () => {
  it("removes every number a mock student must never see, keeps the words", () => {
    const out = withoutBands([{ task: 1, axiomId: "a", overall: 7.5, criteria: buildCriteria(1, axiom) }]);
    expect(out[0].overall).toBeNull();
    expect(out[0].criteria.every((c) => c.band === null)).toBe(true);
    expect(out[0].criteria[0].description).toBe("Complete.");
    expect(JSON.stringify(out)).not.toMatch(/"band":[0-9]/);
  });
});

describe("asResults", () => {
  it("round-trips what we store", () => {
    const stored = [{ task: 2, axiomId: "x", overall: 7, criteria: buildCriteria(2, axiom) }];
    expect(asResults(JSON.parse(JSON.stringify(stored)))).toEqual(stored);
  });
  it("drops malformed entries instead of throwing", () => {
    expect(asResults(null)).toEqual([]);
    expect(asResults("x")).toEqual([]);
    expect(asResults([{ task: 3, criteria: [] }, { task: 1 }, 5])).toEqual([]);
  });
});

describe("the month", () => {
  it("takes YYYY-MM from a local day", () => {
    expect(monthKey("2026-11-14")).toBe("2026-11");
  });
  it("says when the allowance renews, across the year end", () => {
    expect(renewsOn("2026-11")).toBe("1 December");
    expect(renewsOn("2026-12")).toBe("1 January");
    expect(renewsOn("2026-01")).toBe("1 February");
    expect(renewsOn("garbage")).toBe("next month");
  });
  it("computes what is left, never below zero", () => {
    expect(quotaOf(3, "2026-11")).toMatchObject({ used: 3, limit: 10, left: 7, renews: "1 December" });
    expect(quotaOf(12, "2026-11").left).toBe(0);
    expect(quotaOf(-2, "2026-11").used).toBe(0);
  });
  it("labels the criteria for each task", () => {
    expect(criterionLabel("ta", 1)).toBe("Task Achievement");
    expect(criterionLabel("ta", 2)).toBe("Task Response");
  });
});

// ---- saved reports: the headline band and the criteria profile

import { criteriaProfile, headlineBand, weakestCriterion, type AiTaskResult } from "./writing-ai-shared";

const task = (n: 1 | 2, overall: number | null, bands: [number | null, number | null, number | null, number | null]): AiTaskResult => ({
  task: n,
  axiomId: `ax-${n}`,
  overall,
  criteria: (["ta", "cc", "lr", "gra"] as const).map((key, i) => ({
    key,
    label: key,
    band: bands[i],
    description: "",
    suggestions: [],
    revisions: [],
  })),
});

describe("headlineBand", () => {
  it("is the task's own overall for a single task", () => {
    expect(headlineBand([task(2, 6.5, [6, 7, 6, 7])])).toBe(6.5);
  });
  it("weights Task 2 double for a full test", () => {
    // (6 + 2 x 7) / 3 = 6.67 -> 6.5 ; (5 + 2 x 6) / 3 = 5.67 -> 5.5 ; (6.5 + 2 x 7) / 3 = 6.83 -> 7
    expect(headlineBand([task(1, 6, [6, 6, 6, 6]), task(2, 7, [7, 7, 7, 7])])).toBe(6.5);
    expect(headlineBand([task(1, 6.5, [6, 6, 6, 6]), task(2, 7, [7, 7, 7, 7])])).toBe(7);
  });
  it("falls back to the criteria mean when a task has no overall, and to the other task when one is empty", () => {
    expect(headlineBand([task(2, null, [6, 6, 7, 7])])).toBe(6.5);
    expect(headlineBand([task(1, null, [null, null, null, null]), task(2, 7, [7, 7, 7, 7])])).toBe(7);
  });
  it("is null with nothing scored", () => {
    expect(headlineBand([])).toBeNull();
    expect(headlineBand([task(2, null, [null, null, null, null])])).toBeNull();
  });
});

describe("criteriaProfile / weakestCriterion", () => {
  it("averages each criterion across tasks, in IELTS order", () => {
    const p = criteriaProfile([task(1, 6, [6, 6, 6, 6]), task(2, 7, [8, 7, 6, 5])]);
    expect(p.map((c) => c.key)).toEqual(["ta", "cc", "lr", "gra"]);
    expect(p.map((c) => c.band)).toEqual([7, 6.5, 6, 5.5]);
  });
  it("keeps an unscored criterion null rather than zero", () => {
    expect(criteriaProfile([task(2, 6, [6, null, 6, 6])])[1].band).toBeNull();
  });
  it("names the lowest criterion, and nothing when they are level", () => {
    expect(weakestCriterion([task(2, 6, [7, 6.5, 6, 5.5])])?.key).toBe("gra");
    expect(weakestCriterion([task(2, 6, [6, 6, 6, 6])])).toBeNull();
  });
});
