import { describe, expect, it } from "vitest";
import {
  countWords,
  isBand,
  nextSection,
  overallBand,
  roundBand,
  writingBand,
} from "./mock-shared";

describe("roundBand (IELTS overall rounding)", () => {
  it.each([
    [6.0, 6.0],
    [6.1, 6.0],
    [6.125, 6.0],
    [6.25, 6.5],
    [6.5, 6.5],
    [6.625, 6.5],
    [6.75, 7.0],
    [6.9, 7.0],
    [0, 0],
    [9, 9],
  ])("%s -> %s", (input, expected) => {
    expect(roundBand(input)).toBe(expected);
  });

  it("does not let floating-point error round a true .25 down", () => {
    // (6 + 6.5 + 6.25) / 3 = 6.25 exactly on paper
    expect(roundBand((6 + 6.5 + 6.25) / 3)).toBe(6.5);
  });
});

describe("overallBand", () => {
  it("is null until all three sections have a band", () => {
    expect(overallBand({ listening: 7, reading: 6.5, writing: null })).toBeNull();
    expect(overallBand({ listening: null, reading: 6.5, writing: 6 })).toBeNull();
  });

  it("averages and rounds", () => {
    expect(overallBand({ listening: 7, reading: 6.5, writing: 6 })).toBe(6.5);
    expect(overallBand({ listening: 8, reading: 7.5, writing: 6 })).toBe(7.0);
    expect(overallBand({ listening: 6, reading: 6, writing: 5.5 })).toBe(6.0);
  });
});

describe("writingBand", () => {
  it("weights Task 2 double", () => {
    expect(writingBand(5, 7)).toBe(6.5);
    expect(writingBand(6, 6)).toBe(6);
    expect(writingBand(7, 5)).toBe(5.5);
  });
  it("is null without both tasks", () => {
    expect(writingBand(6, null)).toBeNull();
  });
});

describe("isBand", () => {
  it("accepts half steps from 0 to 9 only", () => {
    expect(isBand(6.5)).toBe(true);
    expect(isBand(0)).toBe(true);
    expect(isBand(9)).toBe(true);
    expect(isBand(6.25)).toBe(false);
    expect(isBand(9.5)).toBe(false);
    expect(isBand(-1)).toBe(false);
    expect(isBand(Number.NaN)).toBe(false);
    expect(isBand("6")).toBe(false);
  });
});

describe("countWords", () => {
  it("counts whitespace-separated tokens", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   ")).toBe(0);
    expect(countWords(null)).toBe(0);
    expect(countWords("The chart shows\n\ntwo  trends.")).toBe(5);
  });
});

describe("nextSection", () => {
  const none = { listening_submitted_at: null, reading_submitted_at: null, writing_submitted_at: null };
  it("follows listening -> reading -> writing", () => {
    expect(nextSection(none)).toBe("listening");
    expect(nextSection({ ...none, listening_submitted_at: "x" })).toBe("reading");
    expect(nextSection({ ...none, listening_submitted_at: "x", reading_submitted_at: "x" })).toBe(
      "writing",
    );
    expect(
      nextSection({ listening_submitted_at: "x", reading_submitted_at: "x", writing_submitted_at: "x" }),
    ).toBeNull();
  });
});
