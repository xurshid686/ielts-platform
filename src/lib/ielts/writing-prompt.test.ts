import { describe, expect, it } from "vitest";
import { parseTask1, parseTask2, promptLines, stripBoilerplate } from "./writing-prompt";

describe("stripBoilerplate", () => {
  it("removes the standard lines wherever they sit", () => {
    const raw = `WRITING TASK 2
You should spend about 40 minutes on this task.

Write about the following topic:

Fewer people write by hand. Is this positive or negative?

Give reasons for your answer and include any relevant examples from your own knowledge or experience.

Write at least 250 words.`;
    expect(stripBoilerplate(raw)).toBe("Fewer people write by hand. Is this positive or negative?");
  });

  it("tolerates small wording differences", () => {
    expect(stripBoilerplate("you should spend around 20 mins on this task Summarize the information by selecting and reporting the main features. write a minimum of 150 words")).toBe("");
  });
});

describe("parseTask1", () => {
  it("keeps the topic sentence only", () => {
    const r = parseTask1(
      "The diagram below shows the process of using water to produce electricity.\n\nSummarise the information by selecting and reporting the main features, and make comparisons where relevant.\n\nWrite at least 150 words.",
    );
    expect(r.topic).toBe("The diagram below shows the process of using water to produce electricity.");
    expect(r.warnings).toEqual([]);
  });

  it("warns on something that is not a Task 1 topic", () => {
    expect(parseTask1("Some people think cars are bad.").warnings).toHaveLength(1);
    expect(parseTask1("").warnings[0]).toMatch(/Type/);
  });
});

describe("parseTask2", () => {
  it("splits statement and question marks", () => {
    const r = parseTask2(
      "Fewer and fewer people today write by hand using a pen or pencil. What are the reasons for this? Is this a positive or a negative development?",
    );
    expect(r.statement).toBe("Fewer and fewer people today write by hand using a pen or pencil.");
    expect(r.question).toBe("What are the reasons for this? Is this a positive or a negative development?");
    expect(r.warnings).toEqual([]);
  });

  it("recognises instructions without a question mark", () => {
    const r = parseTask2(
      "Some people believe that university students should pay all the cost of their studies. Others think it should be free. Discuss both views and give your own opinion.",
    );
    expect(r.statement).toBe(
      "Some people believe that university students should pay all the cost of their studies. Others think it should be free.",
    );
    expect(r.question).toBe("Discuss both views and give your own opinion.");
  });

  it("handles 'To what extent'", () => {
    const r = parseTask2("Technology has made life more complex. To what extent do you agree or disagree?");
    expect(r.question).toBe("To what extent do you agree or disagree?");
  });

  it("a blank line always forces the split", () => {
    const r = parseTask2("Is it true that money brings happiness. Many say so.\n\nWhat do you think");
    expect(r.statement).toBe("Is it true that money brings happiness. Many say so.");
    expect(r.question).toBe("What do you think");
  });

  it("keeps e.g. together and warns with no question", () => {
    const r = parseTask2("Hobbies, e.g. painting, are good for people.");
    expect(r.statement).toBe("Hobbies, e.g. painting, are good for people.");
    expect(r.question).toBe("");
    expect(r.warnings).toHaveLength(1);
  });

  it("an all-question prompt keeps the first sentence as the topic", () => {
    const r = parseTask2("Why do people move to cities? What problems does this cause?");
    expect(r.statement).toBe("Why do people move to cities?");
    expect(r.question).toBe("What problems does this cause?");
  });

  it("an old full prompt rebuilds without duplicates", () => {
    const lines = promptLines(2, "You should spend about 40 minutes on this task. Write about the following topic: Cars are bad. Do you agree? Write at least 250 words.");
    expect(lines.filter((l) => /250 words/.test(l))).toHaveLength(1);
    expect(lines.filter((l) => /40 minutes/.test(l))).toHaveLength(1);
    expect(lines).toContain("Cars are bad.");
    expect(lines).toContain("Do you agree?");
  });
});
