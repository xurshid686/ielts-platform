import { describe, it, expect } from "vitest";
import { countsAfterReset, deriveDayStatus, STRIKE_LIMIT } from "./discipline-shared";

// A programme is a list of days, each holding test ids.
const day = (...ids: string[]) => ({ tests: ids.map((id) => ({ id })) });

describe("deriveDayStatus", () => {
  it("reports the day the student is actually on, not a stored counter", () => {
    // The production bug, 2026-09-04: the owner deleted a finished Day 1 and
    // built a new one. `discipline_members.current_day` stayed at 2 while the
    // programme held a single Day 1, and the student was shown "Day 2".
    const programme = [day("reading", "listening")];
    const { currentIndex, complete } = deriveDayStatus(programme, new Set(["reading"]));

    expect(currentIndex).toBe(0); // Day 1 — never a day that does not exist
    expect(complete).toEqual([false]); // one of two papers done
  });

  it("needs EVERY test on a day before the day counts as done", () => {
    const programme = [day("a", "b")];
    expect(deriveDayStatus(programme, new Set(["a"])).complete).toEqual([false]);
    expect(deriveDayStatus(programme, new Set(["a", "b"])).complete).toEqual([true]);
  });

  it("locks every day after the first incomplete one", () => {
    const programme = [day("a"), day("b"), day("c")];
    // Finished day 1, nothing else: they are on day 2, and day 3 sits after it.
    const { currentIndex, complete } = deriveDayStatus(programme, new Set(["a"]));
    expect(currentIndex).toBe(1);
    expect(complete).toEqual([true, false, false]);
  });

  it("does not skip a gap: a later day done early leaves them on the earlier one", () => {
    const programme = [day("a"), day("b"), day("c")];
    const { currentIndex } = deriveDayStatus(programme, new Set(["c"]));
    expect(currentIndex).toBe(0);
  });

  it("stops at the last day once the programme is finished", () => {
    const programme = [day("a"), day("b")];
    const { currentIndex, complete } = deriveDayStatus(programme, new Set(["a", "b"]));
    // Day 2 of 2 — the old code parked them on a day-number one past the end.
    expect(currentIndex).toBe(1);
    expect(complete).toEqual([true, true]);
  });

  it("reopens a finished day when a new test is attached to it", () => {
    const before = deriveDayStatus([day("a"), day("b")], new Set(["a", "b"]));
    expect(before.complete).toEqual([true, true]);

    // The owner adds a third paper to day 1: that day reopens and day 2 re-locks.
    const after = deriveDayStatus([day("a", "new"), day("b")], new Set(["a", "b"]));
    expect(after.complete).toEqual([false, true]);
    expect(after.currentIndex).toBe(0);
  });

  it("treats a day with no tests as never complete", () => {
    // Otherwise an empty placeholder day would auto-complete and unlock the next.
    const { complete, currentIndex } = deriveDayStatus([day(), day("a")], new Set(["a"]));
    expect(complete).toEqual([false, true]);
    expect(currentIndex).toBe(0);
  });

  it("survives a day being deleted and rebuilt with the same tests", () => {
    // The rebuilt day has a different row id, so the completions table lost the
    // tick. Deriving from results keeps the student where they earned to be.
    const rebuilt = [day("reading", "listening")];
    expect(deriveDayStatus(rebuilt, new Set(["reading", "listening"])).complete).toEqual([true]);
  });

  it("returns -1 for an empty programme", () => {
    expect(deriveDayStatus([], new Set()).currentIndex).toBe(-1);
  });
});

describe("countsAfterReset", () => {
  const attempt = "2026-09-04T10:00:00.000Z";

  it("counts everything when the student has never been reset", () => {
    expect(countsAfterReset(attempt, null)).toBe(true);
  });

  it("ignores work done before the reset", () => {
    expect(countsAfterReset(attempt, "2026-09-04T12:00:00.000Z")).toBe(false);
  });

  it("counts work done after the reset", () => {
    expect(countsAfterReset(attempt, "2026-09-04T08:00:00.000Z")).toBe(true);
  });

  it("counts an attempt landing exactly on the reset instant", () => {
    expect(countsAfterReset(attempt, attempt)).toBe(true);
  });

  it("clears the whole programme for a reset student", () => {
    // Reset deletes nothing — their results, XP and rating all survive. The
    // cutoff is what takes their place in the challenge away.
    const results = [
      { test_id: "a", submitted_at: "2026-09-01T00:00:00.000Z" },
      { test_id: "b", submitted_at: "2026-09-02T00:00:00.000Z" },
    ];
    const resetAt = "2026-09-03T00:00:00.000Z";
    const done = new Set(
      results.filter((r) => countsAfterReset(r.submitted_at, resetAt)).map((r) => r.test_id),
    );
    expect(done.size).toBe(0);
    expect(deriveDayStatus([day("a"), day("b")], done).complete).toEqual([false, false]);
  });
});

describe("STRIKE_LIMIT", () => {
  it("is the three strikes the owner asked for", () => {
    expect(STRIKE_LIMIT).toBe(3);
  });
});
