import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Which of these accounts hold ACTIVE paid Premium (premium_until in the
 * future)? Feeds the "shiny" avatar on the leaderboard and public profiles.
 * Service role because profiles' RLS hides other students' rows; it returns
 * only ids, never the date. A trial (premium_trials) does not count.
 */
export async function premiumMemberIds(ids: string[]): Promise<Set<string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Set();
  const { data, error } = await createAdminClient()
    .from("profiles")
    .select("id")
    .in("id", unique)
    .gt("premium_until", new Date().toISOString());
  if (error) return new Set(); // cosmetic: never fail a page over it
  return new Set((data ?? []).map((r) => r.id));
}
