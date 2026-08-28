import { describe, it, expect } from "vitest";
import { testTitle, testDescription, testFormat, testCanonical, testJsonLd, type SeoTest } from "./seo";

const base: SeoTest = {
  id: "54464fee-5d8c-4e18-8af5-8f3b1d89da29",
  title: "Life on Mars?",
  skill: "reading",
  kind: "single",
  tier: "free",
  passage: 3,
  total: 14,
  question_types: ["Multiple choice", "Yes/No/Not Given"],
};

describe("testTitle", () => {
  it("leads with the passage name, which is what students search", () => {
    expect(testTitle(base)).toBe("Life on Mars? — IELTS Reading Passage & Answers");
  });

  // The three real search patterns, all of which must hit the title.
  it.each([
    ["<name> reading", /reading/i],
    ["<name> reading passage", /reading passage/i],
    ["<name> reading answers", /answers/i],
  ])("covers the %s pattern", (_label, re) => {
    expect(testTitle(base)).toMatch(re);
  });

  it("uses the listening wording for a listening test", () => {
    const t = testTitle({ ...base, skill: "listening" });
    expect(t).toContain("Listening Test");
    expect(t).toContain("Answers");
  });
});

describe("testFormat", () => {
  it("names the passage number for a single reading passage", () => {
    expect(testFormat(base)).toBe("Passage 3");
  });
  it("falls back when the passage number is missing", () => {
    expect(testFormat({ ...base, passage: null })).toBe("Single passage");
  });
  it("calls a full paper a full test", () => {
    expect(testFormat({ ...base, kind: "full" })).toBe("Full test");
  });
  it("uses Section for listening", () => {
    expect(testFormat({ ...base, skill: "listening", passage: null })).toBe("Section");
  });
});

describe("testDescription", () => {
  it("names the test, its shape, question count and types", () => {
    const d = testDescription(base);
    expect(d).toContain("Life on Mars?");
    expect(d).toContain("Passage 3");
    expect(d).toContain("14 questions");
    expect(d).toContain("Multiple choice");
  });

  it("puts 'passage' and 'answers' in the part that never gets truncated", () => {
    // The tail is what Google cuts, so the searched-for words go first.
    const head = testDescription(base).slice(0, 100);
    expect(head).toMatch(/reading passage/i);
    expect(head).toMatch(/answers/i);
  });

  it("never truncates mid-word", () => {
    const d = testDescription({
      ...base,
      title: "When and why did we learn to stand on our own two feet and walk upright across the plains",
    });
    expect(d.endsWith("…") ? d.slice(0, -1) : d).not.toMatch(/\s\S{1,3}$/);
  });

  it("stays within Google's ~160 character display limit", () => {
    const longest: SeoTest = {
      ...base,
      title: "When and why did we learn to stand on our own two feet and walk upright across the plains",
      question_types: ["Matching sentence endings", "Note/Table/Flow-chart completion", "Summary completion"],
    };
    expect(testDescription(longest).length).toBeLessThanOrEqual(160);
  });

  it("omits the question-type clause when none are tagged", () => {
    expect(testDescription({ ...base, question_types: [] })).not.toContain("Multiple choice");
  });

  it("omits the question count when total is missing", () => {
    expect(testDescription({ ...base, total: null })).not.toContain("questions");
  });
});

describe("testCanonical", () => {
  it("is absolute and on the canonical host, whatever served the page", () => {
    expect(testCanonical(base)).toBe("https://mockonline.uz/reading/54464fee-5d8c-4e18-8af5-8f3b1d89da29");
  });
});

describe("testJsonLd", () => {
  it("marks a free test as freely accessible", () => {
    expect(testJsonLd(base).isAccessibleForFree).toBe(true);
  });
  it("does not advertise a premium test as free", () => {
    expect(testJsonLd({ ...base, tier: "premium" }).isAccessibleForFree).toBe(false);
  });
  it("is a LearningResource with a canonical url", () => {
    const ld = testJsonLd(base);
    expect(ld["@type"]).toBe("LearningResource");
    expect(ld.url).toContain("mockonline.uz");
  });
});
