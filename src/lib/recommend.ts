// "What should this student sit next?" — one rule, used by the dashboard's
// Focus area and the "What next" block on the review screen, so the two can
// never recommend by different logic.
//
// The rule (unchanged from the dashboard, where it was inline):
//   1. drop tests already attempted,
//   2. keep what the student can open (free, or premium with a membership),
//   3. if a weakest question type is known, keep tests that carry it,
//   4. closest difficulty to the student's rating first.
//
// Pure: imports nothing, so it is unit-tested without a `@/` alias. The caller
// decides which tests are in scope (skill, track) before calling.

export type Recommendable = {
  id: string;
  tier?: string | null;
  question_types?: string[] | null;
  difficulty?: number | null;
};

export type RecommendOptions = {
  /** Test ids the student has already submitted. */
  attempted: ReadonlySet<string | null>;
  /** The question type to train, or null when there is no signal yet. */
  weakType: string | null;
  /** Admin, or an active Premium membership. */
  canOpenPremium: boolean;
  /** The student's rating; tests are ordered by distance from it. */
  rating: number;
  limit?: number;
};

const DEFAULT_DIFFICULTY = 1500;

const byCloseness = (rating: number) => (a: Recommendable, b: Recommendable) =>
  Math.abs((a.difficulty ?? DEFAULT_DIFFICULTY) - rating) -
  Math.abs((b.difficulty ?? DEFAULT_DIFFICULTY) - rating);

const carries = (t: Recommendable, type: string | null) =>
  type ? (t.question_types ?? []).includes(type) : true;

const isPremium = (t: Recommendable) => (t.tier ?? "free") !== "free";

/** Tests the student can open now, best match first. */
export function recommendForWeakType<T extends Recommendable>(tests: T[], o: RecommendOptions): T[] {
  return tests
    .filter((t) => !o.attempted.has(t.id))
    .filter((t) => !isPremium(t) || o.canOpenPremium)
    .filter((t) => carries(t, o.weakType))
    .sort(byCloseness(o.rating))
    .slice(0, o.limit ?? 3);
}

/**
 * The best Premium test for the weakest type that this student can NOT open:
 * the one specific paper a Premium prompt can name. Null for a member, and
 * null when there is no weak type (a prompt that names a random locked paper
 * is just an advert).
 */
export function lockedForWeakType<T extends Recommendable>(tests: T[], o: RecommendOptions): T | null {
  if (o.canOpenPremium || !o.weakType) return null;
  return (
    tests
      .filter((t) => !o.attempted.has(t.id))
      .filter(isPremium)
      .filter((t) => carries(t, o.weakType))
      .sort(byCloseness(o.rating))[0] ?? null
  );
}
