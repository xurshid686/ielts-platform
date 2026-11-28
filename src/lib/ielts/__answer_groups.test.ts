import { describe, expect, it } from "vitest";
import { parseAnswerGroups, regroupAnswers } from "./answer-groups";
import { gradeAnswers } from "./grade";

const key = { "17": ["c"], "18": ["a"], "19": ["f"], "20": ["g"], "21": ["b"] };

describe("parseAnswerGroups", () => {
  it("reads listening data-qs and reading data-mcq-group (list or range)", () => {
    const html = `<div class="mcq multi" data-qs="18,19,20"></div><div data-mcq-group="27-28"></div>
      <div data-qs='11,12'></div><div data-qs="18,19,20"></div>`;
    expect(parseAnswerGroups(html)).toEqual([[18, 19, 20], [27, 28], [11, 12]]);
  });
  it("ignores the engine's own comments and scripts (they mention data-qs=\"27,28\")", () => {
    const html = `<script>// a block (e.g. data-qs="27,28") holds checkboxes</script><!-- data-qs="1,2" -->
      <style>.x[data-qs="5,6"]{}</style><div class="mcq multi" data-qs="18,19,20"></div>`;
    expect(parseAnswerGroups(html)).toEqual([[18, 19, 20]]);
  });
  it("ignores singletons, gaps and oversized groups", () => {
    expect(parseAnswerGroups(`<i data-qs="5"></i><i data-qs="1,3"></i><i data-mcq-group="1-40"></i>`)).toEqual([]);
  });
});

describe("regroupAnswers", () => {
  it("credits the right letters whatever order they were harvested in (the reported bug)", () => {
    const harvested = { "17": "C", "18": "A", "19": "B", "20": "F", "21": "B" }; // ticked A,B,F; key A,F,G
    expect(gradeAnswers(key, harvested).raw).toBe(3);                         // before: 17, 18, 21 only
    const seated = regroupAnswers(key, harvested, [[18, 19, 20]]);
    expect(seated).toEqual({ "17": "C", "18": "A", "19": "F", "20": "B", "21": "B" });
    expect(gradeAnswers(key, seated).raw).toBe(4);
  });
  it("all three right in any order scores three", () => {
    const seated = regroupAnswers(key, { "18": "G", "19": "A", "20": "F" }, [[18, 19, 20]]);
    expect(gradeAnswers(key, seated).raw).toBe(3);
  });
  it("never moves answers between questions outside a group, nor invents any", () => {
    const given = { "17": "A", "18": "C" };
    expect(regroupAnswers(key, given, [[18, 19, 20]])).toEqual({ "17": "A", "18": "C" });
    expect(regroupAnswers(key, {}, [[18, 19, 20]])).toEqual({});
  });
  it("leaves a group alone when the key does not cover it", () => {
    const given = { "30": "B", "31": "A" };
    expect(regroupAnswers(key, given, [[30, 31]])).toEqual(given);
  });
});
