import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { extractAnswerKey, normalizeAnswer } from "./extract-key";
import { gradeAnswers, isAnswerCorrect, asAnswers, asAnswerKey } from "./grade";
import { rawToBand } from "./bandTable";

const seed = (p: string) =>
  readFileSync(join(process.cwd(), "seed", p), "utf8");

describe("extractAnswerKey", () => {
  it("pulls the key from a real CDI listening/notes test", () => {
    const ex = extractAnswerKey(seed("reading/notes-for-a-holiday.html"));
    expect(ex).not.toBeNull();
    expect(ex!.total).toBe(10);
    // single-variant answer
    expect(ex!.key["1"]).toEqual(["terminal"]);
    // multi-variant answers are captured and lowercased
    expect(ex!.key["6"]).toEqual(["raincoat", "a raincoat", "good raincoat"]);
    expect(ex!.key["9"]).toEqual(["chocolate", "some chocolate"]);
    // a value that was capitalised in correctAnswers is normalised
    expect(ex!.key["2"]).toEqual(["pantera"]);
  });

  it("extracts the second seed test too", () => {
    const ex = extractAnswerKey(seed("reading/day-16-passage-3.html"));
    expect(ex).not.toBeNull();
    expect(ex!.total).toBeGreaterThan(0);
  });

  it("returns null when there is no key", () => {
    expect(extractAnswerKey("<html><body>no key here</body></html>")).toBeNull();
  });

  it("falls back to the cdi-listening-master `const KEY = {...}` format", () => {
    const html = `<script>
      const KEY = {
        1:["10","ten"], 8:["cafe","café"],
        11:["a"], 21:["b","d"], 22:["b","d"],
        31:["metal","metals"]
      };
      const TOTAL = 40;
    </script>`;
    const ex = extractAnswerKey(html);
    expect(ex).not.toBeNull();
    expect(ex!.total).toBe(6);
    expect(ex!.key["1"]).toEqual(["10", "ten"]);
    expect(ex!.key["8"]).toEqual(["cafe", "café"]);
    expect(ex!.key["21"]).toEqual(["b", "d"]);
    // a single picked letter still grades against the two-letter slot key
    expect(gradeAnswers(ex!.key, { "21": "b", "22": "d" }).raw).toBe(2);
  });
});

// /review/[id] shows a per-question breakdown of an attempt whose SCORE came
// from gradeAnswers. It used to re-implement the check as a bare
// `accepted.includes(given)`, which drops the listening rule below — so the
// breakdown could mark an answer wrong that the band had been awarded for.
// Both now go through isAnswerCorrect; these tests hold them together.
describe("isAnswerCorrect agrees with gradeAnswers, question by question", () => {
  const key = { "1": ["sw19ab"], "2": ["10 30"], "3": ["east"] };

  for (const skill of ["reading", "listening"] as const) {
    it(`counts exactly the questions it marks correct (${skill})`, () => {
      const answers = { "1": "SW1 9AB", "2": "1030", "3": "EAST", "4": "ignored" };
      const marked = Object.keys(key).filter((q) =>
        isAnswerCorrect(key[q as keyof typeof key], answers[q as keyof typeof answers], skill),
      ).length;
      expect(marked).toBe(gradeAnswers(key, answers, skill).raw);
    });
  }

  it("treats a blank answer as not correct rather than throwing", () => {
    expect(isAnswerCorrect(key["1"], "", "listening")).toBe(false);
    expect(isAnswerCorrect(key["1"], undefined, "listening")).toBe(false);
    expect(isAnswerCorrect(key["1"], null, "listening")).toBe(false);
  });

  it("returns false for a question the key does not have", () => {
    expect(isAnswerCorrect(undefined, "anything", "reading")).toBe(false);
  });

  it("applies the listening spacing rule, and only for listening", () => {
    expect(isAnswerCorrect(key["1"], "SW1 9AB", "listening")).toBe(true);
    expect(isAnswerCorrect(key["1"], "SW1 9AB", "reading")).toBe(false);
  });
});

describe("gradeAnswers", () => {
  const key = extractAnswerKey(seed("reading/notes-for-a-holiday.html"))!.key;

  it("scores a perfect submission", () => {
    const answers = {
      "1": "terminal", "2": "Pantera", "3": "east", "4": "07765328411",
      "5": "hotel restaurant", "6": "a raincoat", "7": "walking shoes",
      "8": "Mountain Lives", "9": "some chocolate", "10": "calendar",
    };
    expect(gradeAnswers(key, answers)).toEqual({ raw: 10, total: 10 });
  });

  it("is case- and whitespace-insensitive and accepts variants", () => {
    const answers = { "1": "  TERMINAL ", "6": "GOOD   raincoat" };
    expect(gradeAnswers(key, answers).raw).toBe(2);
  });

  it("rejects wrong and blank answers", () => {
    const answers = { "1": "wrong", "2": "", "3": "east" };
    expect(gradeAnswers(key, answers).raw).toBe(1);
  });

  it("an empty submission scores zero out of the full total", () => {
    expect(gradeAnswers(key, {})).toEqual({ raw: 0, total: 10 });
  });

  // The saved score must equal the score the page showed the student, and the
  // two shells do not mark identically: the listening player also compares with
  // all spaces removed (its own comment says "postcode"), the reading shells do
  // not. Grading both the same way makes the server disagree with one of them.
  describe("matches the shell that showed the score", () => {
    const postcode = { "1": ["sw19ab"], "2": ["10 30"] };

    it("accepts differently-spaced answers for listening", () => {
      expect(gradeAnswers(postcode, { "1": "SW1 9AB", "2": "1030" }, "listening").raw).toBe(2);
    });

    it("does not for reading, which marks those wrong on the page", () => {
      expect(gradeAnswers(postcode, { "1": "SW1 9AB", "2": "1030" }, "reading").raw).toBe(0);
    });

    it("stays strict when no skill is given", () => {
      expect(gradeAnswers(postcode, { "1": "SW1 9AB" }).raw).toBe(0);
    });

    it("still requires the right letters, not just the right spacing", () => {
      expect(gradeAnswers(postcode, { "1": "SW2 9AB" }, "listening").raw).toBe(0);
    });
  });
});

describe("payload narrowing", () => {
  it("asAnswers keeps only numeric-keyed scalar entries", () => {
    expect(asAnswers({ "1": "a", "2": 3, x: "y", "3": { bad: 1 } })).toEqual({
      "1": "a", "2": "3",
    });
  });
  it("asAnswers rejects non-objects", () => {
    expect(asAnswers(null)).toBeNull();
    expect(asAnswers("nope")).toBeNull();
  });
  it("asAnswerKey coerces array values to string lists", () => {
    expect(asAnswerKey({ "1": ["a", "b"], "2": "skip" })).toEqual({
      "1": ["a", "b"],
    });
  });
});

describe("normalizeAnswer", () => {
  it("trims, lowercases, and collapses whitespace", () => {
    expect(normalizeAnswer("  Hello   World ")).toBe("hello world");
    expect(normalizeAnswer(null)).toBe("");
  });
});

describe("rawToBand", () => {
  it("maps reading raw scores to bands", () => {
    expect(rawToBand("reading", 40, 40)).toBe(9);
    expect(rawToBand("reading", 30, 40)).toBe(7);
    expect(rawToBand("reading", 0, 40)).toBe(0);
  });
  it("scales when total is not 40", () => {
    // 9/10 -> 36/40 -> band 8
    expect(rawToBand("reading", 9, 10)).toBe(8);
  });
});
