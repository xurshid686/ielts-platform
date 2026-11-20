import { describe, expect, it } from "vitest";
import {
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
      if (p) expect(n(u.price)).toBeGreaterThan(n(p.price));
    }
  });
  it("the price line lists every plan", () => {
    expect(ULTIMA_PRICE_LINE).toContain("$5 for 1 month");
    expect(ULTIMA_PRICE_LINE).toContain("$12 for 3 months");
  });
});

describe("ultimaRequestUrl", () => {
  it("opens the owner's chat with the plan, price and account typed in", () => {
    const url = ultimaRequestUrl("teacher@example.com", 3);
    expect(url.startsWith("https://t.me/ListeningReadingTests?text=")).toBe(true);
    const text = decodeURIComponent(url.split("?text=")[1]);
    expect(text).toContain("Ultima (includes Premium)");
    expect(text).toContain("3 months ($12)");
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
