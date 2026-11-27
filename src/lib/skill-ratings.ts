import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { overallRating, type SkillStanding } from "@/lib/rating";

// Per-skill ratings (0079) for one or many students. Service role: the columns
// are newer than src/types/supabase.ts. Read-only.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above
function db(): SupabaseClient<any, any, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createAdminClient() as unknown as SupabaseClient<any, any, any>;
}

export type SkillRatings = {
  overall: number | null;
  rated: number;
  skills: SkillStanding[];
  peaks: { reading: number; listening: number; writing: number };
  overallRank: number | null;
};

const COLS =
  "id, rating, peak_rating, rated_count, listening_rating, listening_peak, listening_rated_count, writing_rating, writing_peak, writing_rated_count";

type Row = Record<string, number | string>;

function shape(p: Row): Omit<SkillRatings, "overallRank"> {
  const n = (k: string, d = 0) => Number(p[k] ?? d);
  const o = overallRating({
    rating: n("rating", 1000),
    rated_count: n("rated_count"),
    listening_rating: n("listening_rating", 1000),
    listening_rated_count: n("listening_rated_count"),
    writing_rating: n("writing_rating", 1000),
    writing_rated_count: n("writing_rated_count"),
  });
  return {
    ...o,
    peaks: { reading: n("peak_rating", 1000), listening: n("listening_peak", 1000), writing: n("writing_peak", 1000) },
  };
}

export async function skillRatingsOf(userId: string): Promise<SkillRatings | null> {
  const client = db();
  const [{ data: p }, { data: rank }] = await Promise.all([
    client.from("profiles").select(COLS).eq("id", userId).maybeSingle(),
    client.from("leaderboard_overall").select("rank").eq("id", userId).maybeSingle(),
  ]);
  if (!p) return null;
  return { ...shape(p as Row), overallRank: rank?.rank != null ? Number(rank.rank) : null };
}

/** Many students at once (group cards). */
export async function skillRatingsFor(ids: string[]): Promise<Map<string, Omit<SkillRatings, "overallRank">>> {
  if (!ids.length) return new Map();
  const { data } = await db().from("profiles").select(COLS).in("id", ids);
  return new Map((data ?? []).map((p) => [String((p as Row).id), shape(p as Row)]));
}
