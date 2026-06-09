// Per-question-type analytics.
//
// A result stores only an aggregate raw/total for a whole test, and a test is
// tagged with the question types it contains (tests.question_types). We can't
// know which *individual* questions a student missed, so we attribute a test's
// accuracy to every type it carries. Averaged over many tests this is a solid
// signal for "which question types is this student weakest at?".

export type TypeStat = {
  type: string;
  /** Accuracy 0–100 across tests carrying this type. */
  accuracy: number;
  /** How many of the user's tests contributed (sample size). */
  tests: number;
};

export type ResultLite = {
  test_id: string | null;
  skill: string;
  raw: number | null;
  total: number | null;
};

export type TestLite = {
  id: string;
  question_types: string[] | null;
};

/**
 * Accuracy per question type for one skill (default reading), weakest first.
 * Only counts results we can attribute to a tagged test with a real score.
 */
export function computeTypeStats(
  results: ResultLite[],
  tests: TestLite[],
  skill = "reading",
): TypeStat[] {
  const typeOf = new Map(tests.map((t) => [t.id, t.question_types ?? []]));
  // type -> [correct, total, testCount]
  const acc = new Map<string, { got: number; max: number; n: number }>();

  for (const r of results) {
    if (r.skill !== skill || !r.test_id) continue;
    if (r.raw == null || r.total == null || r.total <= 0) continue;
    const types = typeOf.get(r.test_id);
    if (!types || types.length === 0) continue;
    for (const ty of types) {
      const cur = acc.get(ty) ?? { got: 0, max: 0, n: 0 };
      cur.got += r.raw;
      cur.max += r.total;
      cur.n += 1;
      acc.set(ty, cur);
    }
  }

  return [...acc.entries()]
    .map(([type, v]) => ({
      type,
      accuracy: Math.round((v.got / v.max) * 100),
      tests: v.n,
    }))
    .sort((a, b) => a.accuracy - b.accuracy || b.tests - a.tests);
}

/**
 * The type to focus on: the lowest-accuracy type with enough signal (≥2 tests),
 * falling back to the single weakest if nothing has 2+ yet. Null if no data.
 */
export function weakestType(stats: TypeStat[]): TypeStat | null {
  if (stats.length === 0) return null;
  return stats.find((s) => s.tests >= 2) ?? stats[0];
}
