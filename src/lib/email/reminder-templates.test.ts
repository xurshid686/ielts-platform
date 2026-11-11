import { describe, expect, it } from "vitest";
import type { Brand } from "./mock-templates";
import {
  buildNeverStartedEmail,
  buildPremiumExpiringEmail,
  buildStreakEmail,
  buildWeeklyReportEmail,
} from "./reminder-templates";
import { planReminders } from "./reminder-plan";

const BRAND: Brand = {
  name: "MockOnline",
  url: "https://mockonline.uz",
  contactUrl: "https://t.me/ListeningReadingTests",
};
const UNSUB = "https://mockonline.uz/unsubscribe/0b0e9c1e-1111-4222-8333-444455556666";
const who = { name: "Aziza Karimova", unsubscribeUrl: UNSUB };

const all = () => [
  buildStreakEmail(BRAND, { ...who, streak: 5 }),
  buildNeverStartedEmail(BRAND, { ...who, day: 1 }),
  buildNeverStartedEmail(BRAND, { ...who, day: 3 }),
  buildWeeklyReportEmail(BRAND, {
    ...who,
    tests: 4,
    avgBand: 6.5,
    bestBand: 7.5,
    ratingDelta: 24,
    reportUrl: "https://mockonline.uz/reports/abc",
  }),
  buildPremiumExpiringEmail(BRAND, { ...who, stage: "before", endsOn: "14 November 2026", priceLine: "$2 for 1 month" }),
  buildPremiumExpiringEmail(BRAND, { ...who, stage: "after", endsOn: "10 November 2026", priceLine: "$2 for 1 month" }),
];

describe("every reminder", () => {
  it("carries the unsubscribe link", () => {
    for (const e of all()) expect(e.html).toContain(`href="${UNSUB}"`);
  });

  it("greets by first name and has a subject", () => {
    for (const e of all()) {
      expect(e.html).toContain("Hi Aziza,");
      expect(e.subject.length).toBeGreaterThan(5);
    }
  });

  it("uses only absolute links", () => {
    for (const e of all()) {
      const hrefs = [...e.html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
      expect(hrefs.length).toBeGreaterThan(1);
      for (const h of hrefs) expect(h).toMatch(/^https:\/\//);
    }
  });

  it("does not say it was sent because of a mock exam", () => {
    for (const e of all()) expect(e.html).not.toContain("sat a mock exam");
  });

  it("never advertises speaking", () => {
    for (const e of all()) expect(e.html.toLowerCase()).not.toContain("speaking");
  });
});

describe("streak email", () => {
  it("names the streak length", () => {
    const e = buildStreakEmail(BRAND, { ...who, streak: 12 });
    expect(e.subject).toBe("Keep your 12-day streak alive");
    expect(e.html).toContain("12-day streak");
  });
});

describe("never-started email", () => {
  it("links to the dashboard start panel, and day 3 says it is the last", () => {
    const first = buildNeverStartedEmail(BRAND, { ...who, day: 1 });
    const last = buildNeverStartedEmail(BRAND, { ...who, day: 3 });
    expect(first.html).toContain('href="https://mockonline.uz/dashboard"');
    expect(first.html).not.toContain("last reminder");
    expect(last.html).toContain("last reminder");
    expect(first.subject).not.toBe(last.subject);
  });
});

describe("weekly report email", () => {
  it("shows the numbers and links to the report", () => {
    const e = all()[3];
    expect(e.subject).toBe("Your week: 4 tests, average band 6.5");
    expect(e.html).toContain("7.5");
    expect(e.html).toContain("went up by <strong>24</strong>");
    expect(e.html).toContain('href="https://mockonline.uz/reports/abc"');
  });

  it("copes with one test and no bands", () => {
    const e = buildWeeklyReportEmail(BRAND, {
      ...who,
      tests: 1,
      avgBand: null,
      bestBand: null,
      ratingDelta: 0,
      reportUrl: "https://mockonline.uz/reports/abc",
    });
    expect(e.subject).toBe("Your week: 1 test, average band —");
    expect(e.html).not.toContain("rating");
  });
});

describe("premium email", () => {
  it("links to /premium and never to Telegram in the body", () => {
    for (const e of all().slice(4)) {
      expect(e.html).toContain('href="https://mockonline.uz/premium"');
      // The shared footer's contact line is the only Telegram link allowed.
      expect(e.html.match(/t\.me/g)?.length ?? 0).toBe(1);
    }
  });

  it("escapes what it is given", () => {
    const e = buildPremiumExpiringEmail(BRAND, {
      name: "<b>x</b>",
      unsubscribeUrl: UNSUB,
      stage: "before",
      endsOn: "<i>soon</i>",
      priceLine: "a & b",
    });
    expect(e.html).not.toContain("<i>soon</i>");
    expect(e.html).toContain("a &amp; b");
    expect(e.html).not.toContain("<b>x</b>");
  });
});

describe("planReminders", () => {
  const c = (userId: string, kind: string) => ({ userId, kind });

  it("gives each student one email, first listed wins", () => {
    const plan = planReminders([c("a", "premium"), c("a", "streak"), c("b", "streak")], new Set(), 0);
    expect(plan.send).toEqual([c("a", "premium"), c("b", "streak")]);
    expect(plan.duplicates).toBe(1);
  });

  it("skips anyone already emailed today", () => {
    const plan = planReminders([c("a", "streak"), c("b", "streak")], new Set(["a"]), 1);
    expect(plan.send).toEqual([c("b", "streak")]);
    expect(plan.alreadyToday).toBe(1);
  });

  it("stops at the daily cap and counts the overflow", () => {
    const plan = planReminders([c("a", "x"), c("b", "x"), c("c", "x")], new Set(), 8, 10);
    expect(plan.send.map((s) => s.userId)).toEqual(["a", "b"]);
    expect(plan.overCap).toBe(1);
  });

  it("sends nothing once the cap is spent", () => {
    const plan = planReminders([c("a", "x")], new Set(), 90);
    expect(plan.send).toEqual([]);
    expect(plan.overCap).toBe(1);
  });
});
