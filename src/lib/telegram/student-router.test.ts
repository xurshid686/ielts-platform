import { describe, it, expect } from "vitest";
import { dailyText, parseStudentText } from "./student-router";

describe("parseStudentText", () => {
  it("reads a link deep link", () => {
    expect(parseStudentText("/start link_ABCdef234567")).toEqual({ kind: "link", code: "ABCdef234567" });
  });
  it("a bad code is a plain start", () => {
    expect(parseStudentText("/start link_short")).toEqual({ kind: "start" });
    expect(parseStudentText("/start")).toEqual({ kind: "start" });
  });
  it("commands, with or without @bot", () => {
    expect(parseStudentText("/test@MyBot")).toEqual({ kind: "test" });
    expect(parseStudentText("/stop")).toEqual({ kind: "stop" });
    expect(parseStudentText("/daily")).toEqual({ kind: "daily" });
    expect(parseStudentText("hello")).toEqual({ kind: "help" });
  });
});

describe("dailyText", () => {
  it("escapes and mentions passes", () => {
    const t = dailyText({ name: "A<b>", title: "Bees & honey", kind: "pass", passesLeft: 2, monday: false, trialDaysLeft: 0 });
    expect(t).toContain("A&lt;b&gt;");
    expect(t).toContain("Bees &amp; honey");
    expect(t).toContain("weekly passes");
    expect(t).toContain("2 free Premium tests left");
  });
  it("monday line and trial line", () => {
    const t = dailyText({ name: null, title: "X", kind: "open", passesLeft: 3, monday: true, trialDaysLeft: 1 });
    expect(t).toContain("for this week are ready");
    expect(t).toContain("trial ends tomorrow");
  });
});
