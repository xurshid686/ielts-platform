import { describe, it, expect } from "vitest";
import { passWeekStart, trialDaysLeft } from "./premium";

describe("passWeekStart (Asia/Tashkent, Monday start)", () => {
  it("a Wednesday maps to its Monday", () => {
    expect(passWeekStart(Date.parse("2026-11-25T10:00:00Z"))).toBe("2026-11-23");
  });
  it("Sunday 20:00 UTC is already Monday in Tashkent", () => {
    expect(passWeekStart(Date.parse("2026-11-29T20:00:00Z"))).toBe("2026-11-30");
  });
  it("Sunday 18:59 UTC is still the old week", () => {
    expect(passWeekStart(Date.parse("2026-11-29T18:59:00Z"))).toBe("2026-11-23");
  });
  it("Monday itself", () => {
    expect(passWeekStart(Date.parse("2026-11-23T00:00:00Z"))).toBe("2026-11-23");
  });
});

describe("trialDaysLeft", () => {
  const now = Date.parse("2026-11-23T12:00:00Z");
  it("none or ended = 0", () => {
    expect(trialDaysLeft(null, now)).toBe(0);
    expect(trialDaysLeft("2026-11-23T11:00:00Z", now)).toBe(0);
  });
  it("rounds up, never below 1", () => {
    expect(trialDaysLeft("2026-11-26T12:00:00Z", now)).toBe(3);
    expect(trialDaysLeft("2026-11-23T13:00:00Z", now)).toBe(1);
  });
});
