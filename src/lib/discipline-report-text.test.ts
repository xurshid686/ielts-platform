import { describe, it, expect } from "vitest";
import {
  cellLines,
  dueHeaderText,
  dateText,
  filterSummary,
  flagSuffix,
  reportFilename,
  studentLabel,
  testScoreText,
} from "./discipline-report-text";

describe("testScoreText / cellLines", () => {
  it("shows the first-attempt score", () => {
    expect(testScoreText({ raw: 12, total: 13 })).toBe("12/13");
  });

  it("marks a test that has not been done with a dot, not a zero", () => {
    // A zero would read as "sat it and scored nothing", which is a different
    // fact about the student and the one the owner acts on.
    expect(testScoreText({ raw: null, total: 13 })).toBe("·");
  });

  it("survives a keyless test with no total", () => {
    expect(testScoreText({ raw: 9, total: null })).toBe("9/?");
  });

  it("gives a day with no tests an em dash so the column is obviously empty", () => {
    expect(cellLines([])).toEqual(["—"]);
  });

  it("returns one line per test, in the order given", () => {
    expect(cellLines([{ raw: 10, total: 13 }, { raw: null, total: 40 }])).toEqual(["10/13", "·"]);
  });

  it("shows EVERY attempt, first one first", () => {
    // The point of the change: a student who improved must not read the same
    // as one who scored 22 once and never came back.
    expect(
      cellLines([
        {
          raw: 22,
          total: 40,
          attempts: [
            { raw: 22, total: 40 },
            { raw: 31, total: 40 },
            { raw: 34, total: 40 },
          ],
        },
      ]),
    ).toEqual(["22/40", "31/40", "34/40"]);
  });

  it("keeps every test's attempts grouped when a day holds several papers", () => {
    expect(
      cellLines([
        { raw: 8, total: 13, attempts: [{ raw: 8, total: 13 }, { raw: 11, total: 13 }] },
        { raw: null, total: 40, attempts: [] },
      ]),
    ).toEqual(["8/13", "11/13", "·"]);
  });
});

describe("studentLabel / flagSuffix", () => {
  it("falls back when a student has saved no name", () => {
    expect(studentLabel(null)).toBe("Student");
    expect(studentLabel("   ")).toBe("Student");
    expect(studentLabel(" Aziz ")).toBe("Aziz");
  });

  it("renders the on-screen pills as a suffix", () => {
    expect(flagSuffix({ inactive: false, trailing: false })).toBe("");
    expect(flagSuffix({ inactive: true, trailing: false })).toBe(" (Inactive)");
    expect(flagSuffix({ inactive: true, trailing: true })).toBe(" (Inactive, Trailing)");
  });

  it("puts Overdue first — it is the only flag naming something the owner set", () => {
    expect(flagSuffix({ inactive: true, trailing: true, overdue: true })).toBe(
      " (Overdue, Inactive, Trailing)",
    );
    expect(flagSuffix({ inactive: false, trailing: false, overdue: true })).toBe(" (Overdue)");
  });
});

describe("dateText", () => {
  it("is unambiguous across locales", () => {
    // The document is generated on the server and forwarded to other people, so
    // "9/5/2026" would be read two different ways. ISO cannot be.
    expect(dateText("2026-09-05T10:00:00.000Z")).toBe("2026-09-05");
  });

  it("says never rather than printing an invalid date", () => {
    expect(dateText(null)).toBe("never");
    expect(dateText("not a date")).toBe("never");
  });
});

describe("filterSummary", () => {
  const none = {
    query: "",
    onlyInactive: false,
    onlyTrailing: false,
    onlyStrikes: false,
    onlyOverdue: false,
    dayNumber: null,
  };

  it("says so when nothing is filtered", () => {
    expect(filterSummary(none)).toBe("All students.");
  });

  it("names every active filter, so a shared file explains itself", () => {
    expect(
      filterSummary({ ...none, onlyTrailing: true, onlyStrikes: true, dayNumber: 3 }),
    ).toBe("Filtered: trailing only · with strikes · not finished Day 3.");
  });

  it("names the overdue filter too", () => {
    expect(filterSummary({ ...none, onlyOverdue: true })).toBe("Filtered: overdue only.");
  });

  it("quotes the search text and ignores whitespace-only input", () => {
    expect(filterSummary({ ...none, query: "  ali " })).toBe("Filtered: matching “ali”.");
    expect(filterSummary({ ...none, query: "   " })).toBe("All students.");
  });
});

describe("reportFilename", () => {
  it("is dated so a week of reports sorts by name", () => {
    expect(reportFilename(new Date("2026-09-05T23:00:00.000Z"))).toBe(
      "discipline-progress-2026-09-05.docx",
    );
  });
});

describe("dueHeaderText", () => {
  it("labels a day that has a deadline", () => {
    expect(dueHeaderText("2026-09-11T18:59:00.000Z")).toBe("due 2026-09-11");
  });

  it("renders nothing for a day without one", () => {
    expect(dueHeaderText(null)).toBeNull();
  });
});
