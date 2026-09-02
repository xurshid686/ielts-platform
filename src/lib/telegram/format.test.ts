import { describe, it, expect } from "vitest";
import {
  escapeHtml,
  clamp,
  band,
  date,
  delta,
  num,
  fmtStats,
  fmtOverview,
  MAX_MESSAGE,
} from "./format";

describe("escapeHtml", () => {
  it("escapes the three characters Telegram's HTML mode cares about", () => {
    expect(escapeHtml("a & b < c > d")).toBe("a &amp; b &lt; c &gt; d");
  });

  it("neutralises markup in a student's own name", () => {
    // A name is user-supplied. Unescaped, "<b>" would either restyle the card
    // or make Telegram reject the whole message as malformed HTML.
    expect(escapeHtml("Ann & <b>Bob</b>")).toBe("Ann &amp; &lt;b&gt;Bob&lt;/b&gt;");
  });
});

describe("clamp", () => {
  it("leaves a short message alone", () => {
    expect(clamp("hello")).toBe("hello");
  });

  it("cuts an over-long message to the limit", () => {
    const long = Array.from({ length: 5000 }, (_, i) => `line ${i}`).join("\n");
    const out = clamp(long);
    expect(out.length).toBeLessThanOrEqual(MAX_MESSAGE);
    expect(out.endsWith("…")).toBe(true);
  });

  it("cuts at a line boundary so a tag is never split", () => {
    const text = `${"<b>x</b>\n".repeat(20)}`;
    const out = clamp(text, 25);
    expect(out.length).toBeLessThanOrEqual(25);
    // No half-open tag survived the cut.
    expect(out.replace(/…$/, "").split("<b>").length).toBe(
      out.replace(/…$/, "").split("</b>").length,
    );
  });
});

describe("scalar formatters", () => {
  it("renders a band to one decimal and a missing one as an em dash", () => {
    expect(band(6.5)).toBe("6.5");
    expect(band(7)).toBe("7.0");
    expect(band(null)).toBe("—");
    expect(band(undefined)).toBe("—");
  });

  it("renders a date, and an em dash for null or nonsense", () => {
    expect(date("2026-03-04T00:00:00.000Z")).toBe("4 Mar 2026");
    expect(date(null)).toBe("—");
    expect(date("not a date")).toBe("—");
  });

  it("renders a signed delta, and nothing when there is no prior period", () => {
    expect(delta(10, 4)).toContain("▲");
    expect(delta(4, 10)).toContain("▼");
    expect(delta(5, 5)).toBe(" (=)");
    expect(delta(5, null)).toBe("");
  });

  it("groups thousands with a narrow space", () => {
    expect(num(1240)).toBe("1\u202f240");
    expect(num(7)).toBe("7");
  });
});

const view = {
  label: "Last 7 days",
  students: 102,
  newStudents: 4,
  tests: 186,
  attempts: 23,
  prevAttempts: 18,
  reading: 18,
  listening: 5,
  avgBand: 6.42,
  bestBand: 8.5,
  activeStreaks: 6,
  premium: 18,
  top: [{ name: "Ann & <b>Bob</b>", attempts: 5, avg: 7.0 }],
};

describe("fmtStats", () => {
  it("renders the period, the counts and the delta", () => {
    const out = fmtStats(view);
    expect(out).toContain("Last 7 days");
    expect(out).toContain("23");
    expect(out).toContain("▲");
    expect(out).toContain("6.4");
    expect(out).toContain("best 8.5");
  });

  it("escapes a student's name in the top list", () => {
    expect(fmtStats(view)).toContain("Ann &amp; &lt;b&gt;Bob&lt;/b&gt;");
  });

  it("omits the top list when there is no activity", () => {
    const out = fmtStats({ ...view, top: [], attempts: 0, avgBand: null, bestBand: null });
    expect(out).not.toContain("Most active");
    expect(out).toContain("—");
  });

  it("stays within Telegram's message limit", () => {
    const many = Array.from({ length: 200 }, (_, i) => ({
      name: `Student number ${i} with a rather long display name`,
      attempts: i,
      avg: 6.5,
    }));
    expect(fmtStats({ ...view, top: many }).length).toBeLessThanOrEqual(MAX_MESSAGE);
  });
});

describe("fmtOverview", () => {
  it("renders the four headline numbers", () => {
    const out = fmtOverview({
      students: 102,
      tests: 186,
      results: 200,
      activeStreaks: 14,
      premium: 18,
      attemptsToday: 6,
      newStudentsToday: 2,
    });
    expect(out).toContain("102 students");
    expect(out).toContain("186 tests");
    expect(out).toContain("200 results");
    expect(out).toContain("6 attempts");
  });
});
