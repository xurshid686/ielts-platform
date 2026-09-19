import { describe, expect, it } from "vitest";
import { classifyTask2, isTask2Type, matchesSearch, normaliseSearch, searchTokens, TASK2_TYPES } from "./task2-question-type";

describe("classifyTask2", () => {
  const cases: [string, string][] = [
    ["Students should pay the full cost of university. To what extent do you agree or disagree?", "agree"],
    ["Sport sponsorship has a bad effect. To what extend you agree or disagree?", "agree"],
    ["Fashion is popular. To what extent do you agree and disagree?", "agree"],
    ["Some say X, others say Y. Discuss both views and give your own opinion.", "discuss"],
    ["Some say X, others say Y. Discuss both sides and give your opinion.", "discuss"],
    ["Many parents work abroad. Do the advantages of this development outweigh its disadvantages?", "advantages"],
    ["Advertising is everywhere. Do you think the positive effects of this overweight the negative effects?", "advantages"],
    ["More people study online. Is this a positive or negative development?", "positive-negative"],
    ["Why do more people study? Is it positive or negative?", "positive-negative"],
    ["Food is wasted. What are the causes? What can be done to solve this problem?", "problem-solution"],
    ["Quality of life is worse. What are the causes? How can they be tackled?", "problem-solution"],
    ["Waste is growing. What are the reasons? How can this problem be solved?", "problem-solution"],
    ["Few students choose science. Why is this the case? What effects does this have on society?", "two-part"],
    ["People spend time away from family. Why is this happening and what effects does it have on them?", "two-part"],
    ["People value artists. What can the arts tell us about life that science cannot?", "other"],
  ];
  it.each(cases)("%s -> %s", (prompt, type) => {
    expect(classifyTask2(prompt)).toBe(type);
  });

  it("files a discussion prompt as discuss even when it also asks questions", () => {
    expect(classifyTask2("Why do people disagree? Is it good? Discuss both views and give your opinion.")).toBe("discuss");
  });

  it("every type has a label and is recognised", () => {
    for (const t of TASK2_TYPES) {
      expect(t.label.length).toBeGreaterThan(5);
      expect(isTask2Type(t.id)).toBe(true);
    }
    expect(isTask2Type("nope")).toBe(false);
  });
});

describe("search", () => {
  it("normalises case, accents and punctuation", () => {
    expect(normaliseSearch("  Café,  RÔLE-models! ")).toBe("cafe role models");
  });
  it("needs every word, in any order", () => {
    const t = "Some people think university education should be free.";
    expect(matchesSearch(t, searchTokens("free university"))).toBe(true);
    expect(matchesSearch(t, searchTokens("free school"))).toBe(false);
    expect(matchesSearch(t, searchTokens("univ"))).toBe(true);
  });
  it("an empty search matches everything", () => {
    expect(searchTokens("  ,, ")).toEqual([]);
    expect(matchesSearch("anything", [])).toBe(true);
  });
});
