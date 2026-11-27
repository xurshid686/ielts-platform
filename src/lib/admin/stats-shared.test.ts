import { describe, expect, it } from "vitest";
import {
  ageLabel,
  asDashboardStats,
  asRange,
  canRetrack,
  formatDelta,
  groupDigits,
  pct,
  pctDelta,
} from "./stats-shared";

describe("admin stats helpers", () => {
  it("pctDelta compares against the previous window", () => {
    expect(pctDelta(150, 100)).toBe(50);
    expect(pctDelta(50, 100)).toBe(-50);
    expect(pctDelta(5, 0)).toBeNull();
    expect(formatDelta(12)).toBe("+12%");
    expect(formatDelta(-8)).toBe("−8%");
    expect(formatDelta(null)).toBe("new");
  });

  it("pct and digit grouping", () => {
    expect(pct(1, 3)).toBe(33);
    expect(pct(1, 0)).toBe(0);
    expect(groupDigits(1234567)).toBe("1 234 567");
  });

  it("asRange only accepts 7, 30, 90", () => {
    expect(asRange("7")).toBe(7);
    expect(asRange("90")).toBe(90);
    expect(asRange("365")).toBe(30);
    expect(asRange(undefined)).toBe(30);
  });

  it("ageLabel", () => {
    const now = Date.parse("2026-11-27T12:00:00Z");
    expect(ageLabel("2026-11-27T11:30:00Z", now)).toBe("30 min");
    expect(ageLabel("2026-11-27T02:00:00Z", now)).toBe("10 h");
    expect(ageLabel("2026-11-20T12:00:00Z", now)).toBe("7 d");
    expect(ageLabel(null, now)).toBeNull();
  });

  it("asDashboardStats survives a partial payload", () => {
    const s = asDashboardStats({ totals: { accounts: "1262" }, series: [{ day: "2026-11-27", results: 3 }] });
    expect(s.totals.accounts).toBe(1262);
    expect(s.series[0].results).toBe(3);
    expect(s.series[0].signups).toBe(0);
    expect(s.period.cur.revenue).toBe(0);
    expect(s.cohorts).toEqual([]);
  });

  it("only regular / pre_ielts / intro can be re-tracked", () => {
    expect(canRetrack("regular", "intro")).toBe(true);
    expect(canRetrack(null, "pre_ielts")).toBe(true);
    expect(canRetrack("discipline", "regular")).toBe(false);
    expect(canRetrack("regular", "mock")).toBe(false);
  });
});
