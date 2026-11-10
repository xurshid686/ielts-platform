import { describe, it, expect } from "vitest";
import { liveStreak, localDay, previousDay } from "./day";

describe("localDay", () => {
  it("uses the student's timezone, not the server's", () => {
    // 2026-08-28T01:30Z. In Tashkent (UTC+5) it is already 06:30 on the 28th;
    // the UTC date agrees here.
    const morning = new Date("2026-08-28T01:30:00Z");
    expect(localDay("Asia/Tashkent", morning)).toBe("2026-08-28");
  });

  it("is the bug that made a late-night test count as yesterday", () => {
    // 2026-08-27T20:30Z is 2026-08-28 01:30 in Tashkent. Slicing the ISO
    // string — what saveResult used to do — yields the 27th, so `firstToday`
    // and the retake-XP cap disagreed with the streak that record_activity()
    // had already closed on the 28th.
    const lateNight = new Date("2026-08-27T20:30:00Z");
    expect(lateNight.toISOString().slice(0, 10)).toBe("2026-08-27");
    expect(localDay("Asia/Tashkent", lateNight)).toBe("2026-08-28");
  });

  it("rolls the other way for timezones behind UTC", () => {
    // 2026-08-28T03:00Z is still the 27th in New York (UTC-4).
    const justAfterMidnightUtc = new Date("2026-08-28T03:00:00Z");
    expect(localDay("America/New_York", justAfterMidnightUtc)).toBe("2026-08-27");
  });

  it("falls back to UTC for a null or empty timezone", () => {
    const at = new Date("2026-08-28T12:00:00Z");
    expect(localDay(null, at)).toBe("2026-08-28");
    expect(localDay("", at)).toBe("2026-08-28");
    expect(localDay(undefined, at)).toBe("2026-08-28");
  });

  it("does not throw on an invalid IANA string", () => {
    // profiles.timezone is only shape-validated, so a value like this can
    // reach us. Saving a test must not fail because of it.
    const at = new Date("2026-08-28T12:00:00Z");
    expect(() => localDay("Custom/Nonsense", at)).not.toThrow();
    expect(localDay("Custom/Nonsense", at)).toBe("2026-08-28");
  });

  it("formats as YYYY-MM-DD, zero-padded", () => {
    expect(localDay("UTC", new Date("2026-01-05T00:00:00Z"))).toBe("2026-01-05");
  });
});

describe("previousDay", () => {
  it("steps back across month and year ends", () => {
    expect(previousDay("2026-03-01")).toBe("2026-02-28");
    expect(previousDay("2026-01-01")).toBe("2025-12-31");
  });
});

describe("liveStreak", () => {
  // 2026-11-10T07:00Z is 12:00 on the 10th in Tashkent.
  const now = new Date("2026-11-10T07:00:00Z");

  it("keeps a streak whose last activity was today or yesterday", () => {
    expect(liveStreak(5, "2026-11-10", "Asia/Tashkent", now)).toBe(5);
    expect(liveStreak(5, "2026-11-09", "Asia/Tashkent", now)).toBe(5);
  });

  it("shows 0 once a whole day has been missed", () => {
    expect(liveStreak(5, "2026-11-08", "Asia/Tashkent", now)).toBe(0);
    expect(liveStreak(12, "2026-09-01", "Asia/Tashkent", now)).toBe(0);
  });

  it("judges the day in the student's timezone", () => {
    // 2026-11-10T20:00Z is already the 11th in Tashkent, still the 10th in UTC.
    const late = new Date("2026-11-10T20:00:00Z");
    expect(liveStreak(3, "2026-11-09", "Asia/Tashkent", late)).toBe(0);
    expect(liveStreak(3, "2026-11-09", "UTC", late)).toBe(3);
  });

  it("is 0 with no streak or no recorded activity", () => {
    expect(liveStreak(0, "2026-11-10", "UTC", now)).toBe(0);
    expect(liveStreak(4, null, "UTC", now)).toBe(0);
    expect(liveStreak(null, "2026-11-10", "UTC", now)).toBe(0);
  });

  it("accepts a timestamp as well as a date", () => {
    expect(liveStreak(2, "2026-11-09T00:00:00+00:00", "UTC", now)).toBe(2);
  });
});
