import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { extractAnswerKey, normalizeAnswer } from "./extract-key";
import { gradeAnswers, asAnswers, asAnswerKey } from "./grade";
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
