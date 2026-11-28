// "Which test should this student sit today?" — ONE rule for the dashboard's
// Today card and the 10:00 Telegram message (lib/student-bot.ts buildDaily),
// so the site and the bot can never suggest different papers.
//
// The rule (moved here unchanged from buildDaily):
//   1. a test is openable if it is free, or the student opens everything
//      (admin / Premium / trial), or they already opened it with a pass, or
//      they still have a pass left this week;
//   2. among openable, unattempted tests, train the weakest question type
//      (lib/analytics.ts), closest difficulty to their rating first
//      (lib/recommend.ts);
//   3. else the newest openable test they have not attempted.
//
// Pure: relative imports of pure modules only, so it is unit-tested without the
// @/ alias. The caller loads the catalogue, results and pass state.

import { computeTypeStats, weakestType, type ResultLite, type TypeStat } from "./analytics";
import { recommendForWeakType } from "./recommend";

export type PickableTest = {
  id: string;
  title: string;
  tier: string;
  question_types: string[] | null;
  difficulty: number | null;
};

export type PickInput<T extends PickableTest> = {
  /** In-scope tests, NEWEST FIRST (the fallback takes the first unattempted one). */
  catalogue: T[];
  /** The student's results (any skill; only reading counts towards the weak type). */
  results: ResultLite[];
  rating: number;
  /** Admin, active Premium, or an active trial. */
  opensAll: boolean;
  /** Null when opensAll (passes do not matter then). */
  passes: { left: number; testIds: ReadonlySet<string> } | null;
};

export type TodayPick<T extends PickableTest> = {
  test: T;
  /** free = a free paper; pass = Premium, opening it spends a weekly pass; open = Premium they can already open. */
  kind: "free" | "pass" | "open";
  weak: TypeStat | null;
};

function canOpen<T extends PickableTest>(t: T, input: PickInput<T>): boolean {
  return (
    t.tier === "free" ||
    input.opensAll ||
    !!input.passes?.testIds.has(t.id) ||
    (input.passes?.left ?? 0) > 0
  );
}

function kindOf<T extends PickableTest>(t: T, input: PickInput<T>): TodayPick<T>["kind"] {
  if (t.tier === "free") return "free";
  return input.opensAll || input.passes?.testIds.has(t.id) ? "open" : "pass";
}

export function attemptedIds(results: ResultLite[]): Set<string | null> {
  return new Set(results.map((r) => r.test_id));
}

/** The weakest reading question type among tests the student can open (null without signal). */
export function weakTypeFor<T extends PickableTest>(input: PickInput<T>): TypeStat | null {
  const openable = input.catalogue.filter((t) => canOpen(t, input));
  return weakestType(computeTypeStats(input.results, openable, "reading"));
}

export function pickToday<T extends PickableTest>(input: PickInput<T>, skip: ReadonlySet<string> = new Set()): TodayPick<T> | null {
  const openable = input.catalogue.filter((t) => canOpen(t, input) && !skip.has(t.id));
  const attempted = attemptedIds(input.results);
  const weak = weakestType(computeTypeStats(input.results, openable, "reading"));
  const test =
    recommendForWeakType(openable, {
      attempted,
      weakType: weak?.type ?? null,
      canOpenPremium: true, // already filtered to what they can open
      rating: input.rating,
      limit: 1,
    })[0] ?? openable.find((t) => !attempted.has(t.id));
  return test ? { test, kind: kindOf(test, input), weak } : null;
}

/**
 * Premium papers worth a weekly pass: unattempted, not already pass-opened, carrying the weak
 * type when there is one, closest difficulty first. Empty for students who open everything or
 * have no passes left. `exclude` keeps today's pick out of the list.
 */
export function passSuggestions<T extends PickableTest>(input: PickInput<T>, exclude: ReadonlySet<string>, limit = 3): T[] {
  if (input.opensAll || !input.passes || input.passes.left <= 0) return [];
  const passes = input.passes;
  const attempted = attemptedIds(input.results);
  const premium = input.catalogue.filter((t) => t.tier !== "free" && !passes.testIds.has(t.id) && !exclude.has(t.id));
  const weak = weakTypeFor(input);
  const pick = (type: string | null) =>
    recommendForWeakType(premium, { attempted, weakType: type, canOpenPremium: true, rating: input.rating, limit });
  const first = pick(weak?.type ?? null);
  // Not enough papers for the weak type: top up with the closest other Premium papers.
  if (first.length >= limit) return first;
  const seen = new Set(first.map((t) => t.id));
  return [...first, ...pick(null).filter((t) => !seen.has(t.id))].slice(0, limit);
}

/** Up to `limit` papers the student can open (passes count), for the weakest type: Progress's "practise next". */
export function recommendOpenable<T extends PickableTest>(input: PickInput<T>, limit = 3): T[] {
  const openable = input.catalogue.filter((t) => canOpen(t, input));
  const weak = weakTypeFor(input);
  return recommendForWeakType(openable, {
    attempted: attemptedIds(input.results),
    weakType: weak?.type ?? null,
    canOpenPremium: true,
    rating: input.rating,
    limit,
  });
}
