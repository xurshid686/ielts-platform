import { describe, expect, it } from "vitest";
import { answerLines, answerMessage } from "./answers-text";

describe("answerLines", () => {
  it("orders numerically and shows alternatives", () => {
    expect(answerLines({ "10": ["roads"], "2": ["true"], "14": ["insects", "mosquitoes"] })).toEqual([
      "2   TRUE",
      "10   roads",
      "14   insects / mosquitoes",
    ]);
  });
  it("uppercases option letters and keeps roman numerals", () => {
    expect(answerLines({ "1": ["j"], "2": ["iv"], "3": ["not given"] })).toEqual(["1   J", "2   iv", "3   NOT GIVEN"]);
  });
  it("tolerates a missing or empty key", () => {
    expect(answerLines(null)).toEqual([]);
    expect(answerMessage("T", {})).toBeNull();
  });
});

describe("answerMessage", () => {
  it("wraps every answer in one spoiler and escapes HTML", () => {
    const m = answerMessage("A & B <test>", { "1": ["x < y"] })!;
    expect(m).toContain("<b>Answers · A &amp; B &lt;test&gt;</b>");
    expect(m).toContain("<tg-spoiler>1   x &lt; y</tg-spoiler>");
    expect(m.match(/<tg-spoiler>/g)).toHaveLength(1);
  });
});
