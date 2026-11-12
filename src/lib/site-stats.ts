import "server-only";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The size of the public library, for the landing page's row of figures.
 *
 * Counted live rather than typed into the page: the library grows every week
 * and a hand-written number is wrong the day after it is written.
 *
 * Service role, because `writing_practice` has no grants for anon (0057) —
 * only COUNTS leave this module, never a row. Cached for an hour so the
 * landing page does not pay four queries per visitor.
 */
export type SiteStats = {
  reading: number;
  listening: number;
  task2: number;
  task1: number;
};

async function countLibrary(): Promise<SiteStats> {
  const db = createAdminClient();
  // The same rule as the catalogue (skill-section.tsx): only the regular track
  // is the public library. Mock, Discipline, pre-IELTS and intro papers are not.
  const tests = (skill: "reading" | "listening") =>
    db
      .from("tests")
      .select("id", { count: "exact", head: true })
      .eq("skill", skill)
      .eq("track", "regular");
  // Every catalogue read of writing_practice must filter `task` (0058).
  const questions = (task: 1 | 2) =>
    db
      .from("writing_practice")
      .select("id", { count: "exact", head: true })
      .eq("published", true)
      .eq("task", task);

  const [reading, listening, task2, task1] = await Promise.all([
    tests("reading"),
    tests("listening"),
    questions(2),
    questions(1),
  ]);

  for (const r of [reading, listening, task2, task1]) {
    // Throwing keeps a failure OUT of the cache; a cached zero would sit on the
    // homepage for an hour.
    if (r.error || r.count === null) throw new Error(r.error?.message ?? "count unavailable");
  }

  return {
    reading: reading.count!,
    listening: listening.count!,
    task2: task2.count!,
    task1: task1.count!,
  };
}

const cachedLibrary = unstable_cache(countLibrary, ["site-stats-v1"], { revalidate: 3600 });

/** Null when the counts cannot be read — the page then shows no figures at all. */
export async function getSiteStats(): Promise<SiteStats | null> {
  try {
    return await cachedLibrary();
  } catch {
    return null;
  }
}
