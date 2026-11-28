import { describe, it, expect } from "vitest";
import { dayIn, estimatedOverall, greeting, skillSnapshot, streakAtRisk, todaysResults } from "./dashboard-shared";

const NOON_TASHKENT = Date.UTC(2026, 10, 28, 7, 0); // 12:00 in Asia/Tashkent (UTC+5)

describe("today in the student's zone", () => {
  it("a result at 23:30 Tashkent yesterday is not today; 00:30 today is", () => {
    const rs = [
      { skill: "reading", band: 6, submitted_at: new Date(Date.UTC(2026, 10, 27, 18, 30)).toISOString() }, // 23:30 27th
      { skill: "reading", band: 7, submitted_at: new Date(Date.UTC(2026, 10, 27, 19, 30)).toISOString() }, // 00:30 28th
    ];
    expect(todaysResults(rs, "Asia/Tashkent", NOON_TASHKENT).map((r) => r.band)).toEqual([7]);
    expect(dayIn(NOON_TASHKENT, "not/a-zone")).toBe("2026-11-28");
  });

  it("greeting follows the zone", () => {
    expect(greeting("Asia/Tashkent", Date.UTC(2026, 10, 28, 3, 0))).toBe("Good morning"); // 08:00
    expect(greeting("Asia/Tashkent", NOON_TASHKENT)).toBe("Good afternoon");
    expect(greeting("Asia/Tashkent", Date.UTC(2026, 10, 28, 16, 0))).toBe("Good evening"); // 21:00
  });
});

describe("skillSnapshot", () => {
  const r = (skill: string, band: number) => ({ skill, band, submitted_at: "2026-11-28T00:00:00Z" });

  it("last five per skill, half-band rounding, no Speaking", () => {
    const snap = skillSnapshot(
      [r("reading", 7), r("reading", 7), r("reading", 6), r("reading", 6), r("reading", 6), r("reading", 1), r("speaking", 9)],
      null,
    );
    expect(snap.map((s) => s.key)).toEqual(["reading", "listening", "writing"]);
    expect(snap[0]).toEqual({ key: "reading", band: 6.5, count: 6 }); // (7+7+6+6+6)/5 = 6.4 -> 6.5, the 6th (1) ignored
    expect(snap[1].band).toBeNull();
  });

  it("Writing comes from the AI check when there is one", () => {
    const snap = skillSnapshot([], 6.5);
    expect(snap[2]).toEqual({ key: "writing", band: 6.5, count: 1 });
  });

  it("overall = mean of the skills that have a band", () => {
    expect(estimatedOverall(skillSnapshot([r("reading", 7), r("listening", 6)], 5.5))).toEqual({ band: 6, skills: 3 });
    expect(estimatedOverall(skillSnapshot([], null))).toEqual({ band: null, skills: 0 });
  });
});

describe("streakAtRisk", () => {
  it("only a live streak not yet kept today", () => {
    expect(streakAtRisk(4, false)).toBe(true);
    expect(streakAtRisk(4, true)).toBe(false);
    expect(streakAtRisk(0, false)).toBe(false);
  });
});
