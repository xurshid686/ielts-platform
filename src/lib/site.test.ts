import { describe, expect, it } from "vitest";
import {
  FRIENDS_PLANS,
  FRIENDS_SEATS,
  friendsRequestUrl,
  perPerson,
  GRANT_PERIODS,
  PREMIUM_PLANS,
  ULTIMA_PLANS,
  ULTIMA_PRICE_LINE,
  premiumRequestUrl,
  ultimaRequestUrl,
} from "./site";

describe("plans", () => {
  it("every sold period can be granted on /admin/members", () => {
    const offered = new Set(GRANT_PERIODS.map((p) => p.months));
    for (const p of [...PREMIUM_PLANS, ...ULTIMA_PLANS]) expect(offered.has(p.months)).toBe(true);
  });
  it("Ultima costs more than Premium for the same period", () => {
    const n = (s: string) => Number(s.replace(/[^0-9.]/g, ""));
    for (const u of ULTIMA_PLANS) {
      const p = PREMIUM_PLANS.find((x) => x.months === u.months);
      if (p) expect(u.priceUzs).toBeGreaterThan(p.priceUzs);
    }
  });
  it("the price line lists every plan", () => {
    expect(ULTIMA_PRICE_LINE).toContain("50\u00a0000 so'm for 1 month");
    expect(ULTIMA_PRICE_LINE).toContain("120\u00a0000 so'm for 3 months");
  });
});

describe("ultimaRequestUrl", () => {
  it("opens the owner's chat with the plan, price and account typed in", () => {
    const url = ultimaRequestUrl("teacher@example.com", 3);
    expect(url.startsWith("https://t.me/ListeningReadingTests?text=")).toBe(true);
    const text = decodeURIComponent(url.split("?text=")[1]);
    expect(text).toContain("Ultima (includes Premium)");
    expect(text).toContain("3 months (120\u00a0000 so'm)");
    expect(text).toContain("My account: teacher@example.com");
  });
  it("still works without a plan or an account", () => {
    const text = decodeURIComponent(ultimaRequestUrl().split("?text=")[1]);
    expect(text).toContain("Ultima");
    expect(text).not.toContain("My account");
  });
  it("is distinct from the Premium link", () => {
    expect(ultimaRequestUrl("a@b.c", 1)).not.toBe(premiumRequestUrl("a@b.c", 1));
  });
});

describe("Friends plan (0077)", () => {
  it("prices: 150 000 for 3 months (owner), every period grantable", () => {
    expect(FRIENDS_PLANS.find((p) => p.months === 3)?.priceUzs).toBe(150_000);
    const offered = new Set(GRANT_PERIODS.map((p) => p.months));
    for (const p of FRIENDS_PLANS) expect(offered.has(p.months)).toBe(true);
  });
  it("is cheaper per person than Premium alone, but costs more than one Premium", () => {
    for (const f of FRIENDS_PLANS) {
      const p = PREMIUM_PLANS.find((x) => x.months === f.months)!;
      expect(f.priceUzs / FRIENDS_SEATS).toBeLessThan(p.priceUzs);
      expect(f.priceUzs).toBeGreaterThan(p.priceUzs);
    }
  });
  it("per-person price and request link", () => {
    expect(perPerson(FRIENDS_PLANS.find((p) => p.months === 3)!)).toBe("37 500 so'm");
    const text = decodeURIComponent(friendsRequestUrl("a@b.uz", 3).split("?text=")[1]);
    expect(text).toContain("Friends (Premium for 4 people) for 3 months (150 000 so'm)");
    expect(text).toContain("My account: a@b.uz");
  });
});
