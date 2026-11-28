import { describe, it, expect } from "vitest";
import { passSuggestions, pickToday, type PickInput, type PickableTest } from "./today-pick";

const t = (id: string, tier: "free" | "premium", types: string[], difficulty = 1500): PickableTest => ({
  id,
  title: id,
  tier,
  question_types: types,
  difficulty,
});

// Newest first.
const catalogue = [
  t("p-headings-1", "premium", ["Matching headings"], 1500),
  t("p-headings-2", "premium", ["Matching headings"], 1700),
  t("p-tfng", "premium", ["True/False/Not Given"], 1500),
  t("f-headings", "free", ["Matching headings"], 1900),
  t("f-tfng-new", "free", ["True/False/Not Given"], 1500),
  t("f-tfng-old", "free", ["True/False/Not Given"], 1500),
];
// Weak at headings (1/10), strong at TFNG (9/10), both over 2 tests.
const results = [
  { test_id: "f-tfng-old", skill: "reading", raw: 9, total: 10 },
  { test_id: "x-headings-a", skill: "reading", raw: 1, total: 10 },
  { test_id: "x-headings-b", skill: "reading", raw: 1, total: 10 },
  { test_id: "x-tfng", skill: "reading", raw: 9, total: 10 },
];
const extra = [t("x-headings-a", "free", ["Matching headings"]), t("x-headings-b", "free", ["Matching headings"]), t("x-tfng", "free", ["True/False/Not Given"])];
const base = (o: Partial<PickInput<PickableTest>> = {}): PickInput<PickableTest> => ({
  catalogue: [...catalogue, ...extra],
  results,
  rating: 1500,
  opensAll: false,
  passes: { left: 3, testIds: new Set() },
  ...o,
});

describe("pickToday", () => {
  it("free student with passes: the weak type, closest difficulty, even when Premium (a pass)", () => {
    const p = pickToday(base());
    expect(p?.weak?.type).toBe("Matching headings");
    expect(p?.test.id).toBe("p-headings-1");
    expect(p?.kind).toBe("pass");
  });

  it("no passes left: only free papers, still the weak type", () => {
    const p = pickToday(base({ passes: { left: 0, testIds: new Set() } }));
    expect(p?.test.id).toBe("f-headings");
    expect(p?.kind).toBe("free");
  });

  it("a pass-opened paper counts as open even with no passes left", () => {
    const p = pickToday(base({ passes: { left: 0, testIds: new Set(["p-headings-1"]) } }));
    expect(p?.test.id).toBe("p-headings-1");
    expect(p?.kind).toBe("open");
  });

  it("Premium / trial opens everything", () => {
    const p = pickToday(base({ opensAll: true, passes: null }));
    expect(p?.kind).toBe("open");
    expect(p?.test.id).toBe("p-headings-1");
  });

  it("no signal yet: any type, closest difficulty to the rating", () => {
    const p = pickToday(base({ results: [], passes: { left: 0, testIds: new Set() } }));
    expect(p?.weak).toBeNull();
    expect(p?.test.id).toBe("f-tfng-new"); // 1500 beats f-headings' 1900 at rating 1500
  });

  it("skip moves on to the next paper (the 'another one' button)", () => {
    const p = pickToday(base(), new Set(["p-headings-1"]));
    expect(p?.test.id).toBe("p-headings-2");
  });

  it("nothing left: null", () => {
    const all = [...catalogue, ...extra].map((x) => ({ test_id: x.id, skill: "reading", raw: 5, total: 10 }));
    expect(pickToday(base({ results: all }))).toBeNull();
  });
});

describe("passSuggestions", () => {
  it("Premium papers for the weak type first, today's pick excluded, topped up", () => {
    const s = passSuggestions(base(), new Set(["p-headings-1"]));
    expect(s.map((x) => x.id)).toEqual(["p-headings-2", "p-tfng"]);
  });
  it("none for members or with no passes", () => {
    expect(passSuggestions(base({ opensAll: true, passes: null }), new Set())).toEqual([]);
    expect(passSuggestions(base({ passes: { left: 0, testIds: new Set() } }), new Set())).toEqual([]);
  });
  it("leaves out papers already opened with a pass", () => {
    const s = passSuggestions(base({ passes: { left: 2, testIds: new Set(["p-headings-2"]) } }), new Set());
    expect(s.map((x) => x.id)).not.toContain("p-headings-2");
  });
});
