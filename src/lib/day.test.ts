import { describe, it, expect } from "vitest";
import { localDay } from "./day";

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
