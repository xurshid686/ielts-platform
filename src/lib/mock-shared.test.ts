import { describe, expect, it } from "vitest";
import {
  adminStage,
  applyIntegrityEvents,
  countEmailStatuses,
  emailBucket,
  applyWritingViolation,
  recordAutoSubmit,
  WRITING_MAX_VIOLATIONS,
  asIntegrity,
  emptyIntegrity,
  integrityVerdict,
  isExamCapableDevice,
  recordReload,
  recordVideoSkip,
  sameTypedTitle,
  csvCell,
  countWords,
  isBand,
  nextSection,
  overallBand,
  roundBand,
  writingBand,
} from "./mock-shared";

describe("roundBand (IELTS overall rounding)", () => {
  it.each([
    [6.0, 6.0],
    [6.1, 6.0],
    [6.125, 6.0],
    [6.25, 6.5],
    [6.5, 6.5],
    [6.625, 6.5],
    [6.75, 7.0],
    [6.9, 7.0],
    [0, 0],
    [9, 9],
  ])("%s -> %s", (input, expected) => {
    expect(roundBand(input)).toBe(expected);
  });

  it("does not let floating-point error round a true .25 down", () => {
    // (6 + 6.5 + 6.25) / 3 = 6.25 exactly on paper
    expect(roundBand((6 + 6.5 + 6.25) / 3)).toBe(6.5);
  });
});

describe("overallBand", () => {
  it("is null until all three sections have a band", () => {
    expect(overallBand({ listening: 7, reading: 6.5, writing: null })).toBeNull();
    expect(overallBand({ listening: null, reading: 6.5, writing: 6 })).toBeNull();
  });

  it("averages and rounds", () => {
    expect(overallBand({ listening: 7, reading: 6.5, writing: 6 })).toBe(6.5);
    expect(overallBand({ listening: 8, reading: 7.5, writing: 6 })).toBe(7.0);
    expect(overallBand({ listening: 6, reading: 6, writing: 5.5 })).toBe(6.0);
  });
});

describe("writingBand", () => {
  it("weights Task 2 double", () => {
    expect(writingBand(5, 7)).toBe(6.5);
    expect(writingBand(6, 6)).toBe(6);
    expect(writingBand(7, 5)).toBe(5.5);
  });
  it("is null without both tasks", () => {
    expect(writingBand(6, null)).toBeNull();
  });
});

describe("isBand", () => {
  it("accepts half steps from 0 to 9 only", () => {
    expect(isBand(6.5)).toBe(true);
    expect(isBand(0)).toBe(true);
    expect(isBand(9)).toBe(true);
    expect(isBand(6.25)).toBe(false);
    expect(isBand(9.5)).toBe(false);
    expect(isBand(-1)).toBe(false);
    expect(isBand(Number.NaN)).toBe(false);
    expect(isBand("6")).toBe(false);
  });
});

describe("countWords", () => {
  it("counts whitespace-separated tokens", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   ")).toBe(0);
    expect(countWords(null)).toBe(0);
    expect(countWords("The chart shows\n\ntwo  trends.")).toBe(5);
  });
});

describe("nextSection", () => {
  const none = { listening_submitted_at: null, reading_submitted_at: null, writing_submitted_at: null };
  it("follows listening -> reading -> writing", () => {
    expect(nextSection(none)).toBe("listening");
    expect(nextSection({ ...none, listening_submitted_at: "x" })).toBe("reading");
    expect(nextSection({ ...none, listening_submitted_at: "x", reading_submitted_at: "x" })).toBe(
      "writing",
    );
    expect(
      nextSection({ listening_submitted_at: "x", reading_submitted_at: "x", writing_submitted_at: "x" }),
    ).toBeNull();
  });
});

describe("adminStage", () => {
  const base = {
    status: "approved",
    started_at: null,
    listening_submitted_at: null,
    reading_submitted_at: null,
    writing_submitted_at: null,
    writing_band: null,
    overall_band: null,
  };
  it("separates needs grading from ready to release", () => {
    expect(adminStage({ ...base, status: "submitted" })).toBe("needs_grading");
    expect(adminStage({ ...base, status: "submitted", writing_band: 6, overall_band: 6.5 })).toBe(
      "ready_to_release",
    );
    expect(adminStage({ ...base, status: "released", writing_band: 6, overall_band: 6.5 })).toBe("released");
  });
  it("tracks progress through the sections", () => {
    expect(adminStage(base)).toBe("not_started");
    expect(adminStage({ ...base, status: "in_progress", started_at: "x" })).toBe("listening");
    expect(adminStage({ ...base, status: "in_progress", started_at: "x", listening_submitted_at: "x" })).toBe(
      "reading",
    );
  });
});

describe("csvCell", () => {
  it("neutralises formulas and quotes separators", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("line\r\nbreak")).toBe('"line\r\nbreak"');
    expect(csvCell(6.5)).toBe("6.5");
    expect(csvCell(-1)).toBe("-1");
    expect(csvCell(null)).toBe("");
  });
});

describe("sameTypedTitle (delete confirmation)", () => {
  it("accepts the title as a person types it", () => {
    // The live bug: "Mock  1 Sunday" has two spaces, so nobody could type it
    // and the Delete button never enabled.
    expect(sameTypedTitle("Mock 1 Sunday", "Mock  1 Sunday")).toBe(true);
    expect(sameTypedTitle("  Mock 1 Sunday  ", "Mock  1 Sunday")).toBe(true);
    expect(sameTypedTitle("mock 1 sunday", "Mock  1 Sunday")).toBe(true);
    expect(sameTypedTitle("Mock\t1\nSunday", "Mock  1 Sunday")).toBe(true);
  });

  it("still requires the whole title", () => {
    expect(sameTypedTitle("Mock 1", "Mock  1 Sunday")).toBe(false);
    expect(sameTypedTitle("", "Mock  1 Sunday")).toBe(false);
    expect(sameTypedTitle("Mock 2 Sunday", "Mock  1 Sunday")).toBe(false);
    expect(sameTypedTitle("Mock1Sunday", "Mock  1 Sunday")).toBe(false);
  });
});

describe("integrity", () => {
  const now = "2026-09-15T10:00:00.000Z";

  it("clamps, validates and counts events", () => {
    const i = applyIntegrityEvents(
      emptyIntegrity(),
      [
        { type: "device", section: "listening", ua: "Chrome", screen: "1920x1080" },
        { type: "away", section: "listening", ms: 5000, kind: "fullscreen" },
        { type: "away", section: "listening", ms: 900, kind: "hidden" }, // below grace: dropped
        { type: "away", section: "reading", ms: 1500, kind: "fullscreen" }, // counted, not long
        { type: "paste", section: "writing", words: 150, task: 2 },
        { type: "paste", section: "writing", words: 2 }, // too small: dropped
        { type: "bogus", section: "writing" },
        { type: "away", section: "nowhere", ms: 1 },
        null,
      ],
      now,
    );
    expect(i.counters.away).toBe(2);
    expect(i.counters.long_away).toBe(1);
    expect(i.counters.away_ms).toBe(6500);
    expect(i.counters.pastes).toBe(1);
    expect(i.counters.largest_paste_words).toBe(150);
    expect(i.device).toBe("Chrome · 1920x1080");
    expect(i.events.every((e) => e.t === now)).toBe(true);
    expect(i.events).toHaveLength(4);
  });

  it("caps the event list", () => {
    let i = emptyIntegrity();
    for (let n = 0; n < 20; n++) {
      i = applyIntegrityEvents(i, Array.from({ length: 50 }, () => ({ type: "second_tab", section: "reading" })), now);
    }
    expect(i.events.length).toBe(300);
    expect(i.counters.second_tab).toBe(1000);
  });

  it("gives a verdict", () => {
    const clean = applyIntegrityEvents(emptyIntegrity(), [{ type: "device", section: "listening", ua: "x" }], now);
    expect(integrityVerdict(clean).level).toBe("clear");
    expect(integrityVerdict(emptyIntegrity()).level).toBe("incomplete");
    const v = integrityVerdict(recordReload(clean, "listening", now));
    expect(v.level).toBe("review");
    expect(v.reasons[0]).toMatch(/Reloaded during Listening/);
    const fast = integrityVerdict(clean, [
      { section: "reading", startedAt: "2026-09-15T10:00:00Z", submittedAt: "2026-09-15T10:05:00Z", minutes: 60 },
    ]);
    expect(fast.level).toBe("review");
  });

  it("notes a skipped instruction video without making it a violation", () => {
    const clean = applyIntegrityEvents(emptyIntegrity(), [{ type: "device", section: "listening", ua: "x" }], now);
    const i = recordVideoSkip(clean, "listening", now);
    expect(i.events.at(-1)).toMatchObject({ type: "video_skip", section: "listening", t: now });
    // Evidence only: no counter moves and the verdict is untouched.
    expect(i.counters).toEqual(clean.counters);
    expect(integrityVerdict(i).level).toBe("clear");
  });

  it("records a platform outage without blaming the student", () => {
    const clean = applyIntegrityEvents(emptyIntegrity(), [{ type: "device", section: "listening", ua: "x" }], now);
    const i = applyIntegrityEvents(clean, [{ type: "paper_unavailable", section: "listening", ms: 82_000 }], now);
    expect(i.events.at(-1)).toMatchObject({ type: "paper_unavailable", section: "listening", ms: 82_000 });
    // Evidence about the platform: no misconduct counter moves, verdict stays clear.
    expect(i.counters).toEqual(clean.counters);
    expect(integrityVerdict(i).level).toBe("clear");
  });

  it("forgives away time that coincided with the paper being down", () => {
    const base = applyIntegrityEvents(emptyIntegrity(), [{ type: "device", section: "listening", ua: "x" }], now);
    // 82 s away — on its own that is over the 60 s "review" line.
    const away = applyIntegrityEvents(base, [{ type: "away", section: "listening", ms: 82_000, kind: "fullscreen" }], now);
    expect(integrityVerdict(away).level).toBe("review");

    // The same 82 s, recorded at the same moment as an outage of the same length.
    const excused = applyIntegrityEvents(away, [{ type: "paper_unavailable", section: "listening", ms: 82_000 }], now);
    const v = integrityVerdict(excused);
    expect(v.level).toBe("clear");
    expect(v.notes?.[0]).toMatch(/coincided with the paper failing to load/);
    // History is NOT rewritten: the away event and its counters are still there.
    expect(excused.counters.away_ms).toBe(82_000);
    expect(excused.events.some((e) => e.type === "away")).toBe(true);
  });

  it("does not forgive away time from a different moment", () => {
    const base = applyIntegrityEvents(emptyIntegrity(), [{ type: "device", section: "listening", ua: "x" }], now);
    const away = applyIntegrityEvents(base, [{ type: "away", section: "listening", ms: 82_000, kind: "fullscreen" }], now);
    // An outage an hour later cannot excuse it.
    const later = new Date(Date.parse(now) + 60 * 60_000).toISOString();
    const other = applyIntegrityEvents(away, [{ type: "paper_unavailable", section: "listening", ms: 5_000 }], later);
    expect(integrityVerdict(other).level).toBe("review");
  });

  it("survives malformed stored data", () => {
    expect(asIntegrity("nope").counters.away).toBe(0);
    expect(asIntegrity({ counters: { away: "7", reloads: -3 } }).counters).toMatchObject({ away: 7, reloads: 0 });
  });

  it("recognises exam-capable devices", () => {
    const laptop = { finePointer: true, anyFinePointer: true, screenW: 1366, screenH: 768, fullscreenEnabled: true };
    expect(isExamCapableDevice(laptop)).toBe(true);
    expect(isExamCapableDevice({ ...laptop, finePointer: false, anyFinePointer: false })).toBe(false);
    expect(isExamCapableDevice({ ...laptop, screenW: 390, screenH: 844 })).toBe(false);
    expect(isExamCapableDevice({ ...laptop, fullscreenEnabled: false })).toBe(false);
    expect(isExamCapableDevice({ ...laptop, finePointer: false, anyFinePointer: true })).toBe(true);
  });
});

describe("writing violations (v3)", () => {
  it("counts up, records the detail, and marks an auto-submit", () => {
    const now = "2026-09-15T10:00:00.000Z";
    let i = applyWritingViolation(emptyIntegrity(), "switch", { ms: 6200 }, now);
    i = applyWritingViolation(i, "paste", { words: 42, task: 2 }, now);
    expect(i.counters.writing_violations).toBe(2);
    expect(i.events.map((e) => e.violation)).toEqual(["switch", "paste"]);
    expect(i.events[1]).toMatchObject({ words: 42, task: 2, section: "writing" });
    expect(integrityVerdict({ ...i, device: "x" }).reasons[0]).toMatch(/2 of 3/);

    i = applyWritingViolation(i, "reload", {}, now);
    expect(i.counters.writing_violations).toBe(WRITING_MAX_VIOLATIONS);
    i = recordAutoSubmit(i, now);
    expect(i.counters.writing_auto_submitted).toBe(1);
    expect(integrityVerdict({ ...i, device: "x" }).reasons[0]).toMatch(/auto-submitted/);
    // survives a jsonb round trip
    expect(asIntegrity(JSON.parse(JSON.stringify(i))).counters.writing_violations).toBe(3);
  });
});

describe("email status counts (0056)", () => {
  const A = (over: Partial<{ status: string; student_email: string | null; result_email_status: string | null; receipt_email_sent_at: string | null }> = {}) => ({
    status: "released",
    student_email: "s@example.com",
    result_email_status: "delivered",
    receipt_email_sent_at: "2026-09-16T00:00:00Z",
    ...over,
  });

  it("buckets one state per released attempt, and they add up", () => {
    const c = countEmailStatuses([
      A(),
      A({ result_email_status: "sent" }),
      A({ result_email_status: "bounced" }),
      A({ result_email_status: "failed" }),
      A({ result_email_status: null }),
      A({ student_email: null, result_email_status: null }),
      // not released: no email is due, so it is not counted at all
      A({ status: "submitted" }),
    ]);
    expect(c.released).toBe(6);
    expect(c.delivered + c.sent + c.bounced + c.failed + c.not_sent + c.no_address).toBe(c.released);
    expect({ delivered: c.delivered, sent: c.sent, bounced: c.bounced, failed: c.failed, not_sent: c.not_sent, no_address: c.no_address })
      .toEqual({ delivered: 1, sent: 1, bounced: 1, failed: 1, not_sent: 1, no_address: 1 });
  });

  it("an address is the first question: no address beats any stored status", () => {
    expect(emailBucket(A({ student_email: null, result_email_status: "delivered" }))).toBe("no_address");
  });

  it("an unreleased attempt has no bucket", () => {
    expect(emailBucket(A({ status: "in_progress" }))).toBeNull();
  });

  it("an unknown stored status reads as not emailed", () => {
    expect(emailBucket(A({ result_email_status: "weird" }))).toBe("not_sent");
  });

  it("counts receipts separately, with their own denominator", () => {
    const c = countEmailStatuses([A(), A({ receipt_email_sent_at: null }), A({ status: "submitted" })], 2);
    expect(c.receipts_sent).toBe(2);
    expect(c.receipts_failed).toBe(2);
  });
});
