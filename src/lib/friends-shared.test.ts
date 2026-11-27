import { describe, expect, it } from "vitest";
import { cleanCode, cleanGroupName, weekStartIso } from "./friends-shared";

describe("cleanCode", () => {
  it("normalises what people paste", () => {
    expect(cleanCode(" ab-cd 23ef ")).toBe("ABCD23EF");
    expect(cleanCode("abc")).toBeNull();
  });
});

describe("weekStartIso", () => {
  it("is Monday 00:00 UTC", () => {
    expect(weekStartIso(new Date("2026-11-27T17:00:00Z"))).toBe("2026-11-23T00:00:00.000Z"); // Friday
    expect(weekStartIso(new Date("2026-11-29T23:59:00Z"))).toBe("2026-11-23T00:00:00.000Z"); // Sunday
    expect(weekStartIso(new Date("2026-11-30T00:00:00Z"))).toBe("2026-11-30T00:00:00.000Z"); // Monday
  });
});

describe("cleanGroupName", () => {
  it("trims and squashes spaces", () => {
    expect(cleanGroupName("  IELTS   Tigers ")).toEqual({ ok: true, name: "IELTS Tigers" });
  });
  it("empty resets to the default", () => {
    expect(cleanGroupName("   ")).toEqual({ ok: true, name: null });
  });
  it("enforces 2-30 characters", () => {
    expect(cleanGroupName("A").ok).toBe(false);
    expect(cleanGroupName("x".repeat(31)).ok).toBe(false);
  });
  it("blocks rude words, even spaced out", () => {
    expect(cleanGroupName("f.u.c.k team").ok).toBe(false);
    expect(cleanGroupName("Сука").ok).toBe(false);
    expect(cleanGroupName("Band 8 Club").ok).toBe(true);
  });
});
