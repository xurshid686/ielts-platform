import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rows } from "@/types/database";

// Re-exported so server code has one import for the feature; the constant lives
// in a client-safe module because the admin UI is a client component.
export { STRIKE_LIMIT } from "@/lib/discipline-shared";

export type DisciplineTest = {
  id: string;
  slug: string | null;
  title: string;
  skill: "reading" | "listening";
  total: number | null;
  /** 'discipline' means the paper exists only inside this programme. */
  track: string;
  position: number;
};

export type DisciplineDay = {
  id: string;
  day_number: number;
  title: string | null;
  instructions: string | null;
  tests: DisciplineTest[];
};

/**
 * The whole programme, days in order, each with its tests.
 *
 * Read with the CALLER'S client, not the service role: the RLS policies from
 * 0046 mean a non-member gets an empty programme rather than a leak, so the
 * page's gate and the database agree even if one of them is ever changed.
 *
 * Columns are named explicitly. `select("*")` on `tests` fails outright since
 * 0034 revoked column-level SELECT (see CLAUDE.md).
 */
export async function loadProgramme(): Promise<DisciplineDay[]> {
  const supabase = await createClient();

  const { data: dayRows } = await supabase
    .from("discipline_days")
    .select("id, day_number, title, instructions")
    .order("day_number", { ascending: true });

  const days = rows<{
    id: string;
    day_number: number;
    title: string | null;
    instructions: string | null;
  }>(dayRows);
  if (days.length === 0) return [];

  const { data: linkRows } = await supabase
    .from("discipline_day_tests")
    .select("day_id, test_id, position")
    .in(
      "day_id",
      days.map((d) => d.id),
    );
  const links = rows<{ day_id: string; test_id: string; position: number }>(linkRows);

  let testsById = new Map<string, Omit<DisciplineTest, "position">>();
  if (links.length > 0) {
    const { data: testRows } = await supabase
      .from("tests")
      .select("id, slug, title, skill, total, track")
      .in(
        "id",
        links.map((l) => l.test_id),
      );
    testsById = new Map(
      rows<{
        id: string;
        slug: string | null;
        title: string;
        skill: "reading" | "listening";
        total: number | null;
        track: string;
      }>(testRows).map((t) => [t.id, t]),
    );
  }

  return days.map((d) => ({
    ...d,
    tests: links
      .filter((l) => l.day_id === d.id)
      .map((l) => {
        const t = testsById.get(l.test_id);
        return t ? { ...t, position: l.position } : null;
      })
      .filter((t): t is DisciplineTest => t !== null)
      .sort((a, b) => a.position - b.position),
  }));
}

/** The day_ids this student has finished. */
export async function loadCompletions(userId: string): Promise<Set<string>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("discipline_completions")
    .select("day_id")
    .eq("user_id", userId);
  return new Set(rows<{ day_id: string }>(data).map((r) => r.day_id));
}

/**
 * Called after a result is saved: if that test belongs to a Discipline day and
 * every test of that day is now done, tick the day off and move the student on.
 *
 * Written with the SERVICE-ROLE client because the completions table grants no
 * writes to any client role (0046) — a completion advances a student through
 * the programme, so it follows the same rule as `results`: written by the
 * server, from a verified session, never by the browser. `userId` therefore
 * comes from the caller's verified session, never from request input.
 *
 * `current_day` is recomputed as the LOWEST day the student has not finished,
 * rather than incremented. That is self-healing: it lands in the right place
 * after a reset, after the owner inserts a day in the middle of the programme,
 * and if this ever runs twice for the same submission.
 */
export async function recordDisciplineProgress(
  userId: string,
  testId: string,
  resultId: string | null,
): Promise<void> {
  const db = createAdminClient();

  const { data: memberRow } = await db
    .from("discipline_members")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!memberRow) return; // not in the challenge — nothing to record

  const { data: linkRows } = await db
    .from("discipline_day_tests")
    .select("day_id")
    .eq("test_id", testId);
  const dayIds = [...new Set(rows<{ day_id: string }>(linkRows).map((l) => l.day_id))];
  if (dayIds.length === 0) return; // an ordinary test, not part of the programme

  // Every test belonging to the affected days, and everything this student has
  // ever submitted for them — two queries rather than one per day.
  const { data: allLinks } = await db
    .from("discipline_day_tests")
    .select("day_id, test_id")
    .in("day_id", dayIds);
  const links = rows<{ day_id: string; test_id: string }>(allLinks);

  const { data: resultRows } = await db
    .from("results")
    .select("test_id")
    .eq("user_id", userId)
    .in(
      "test_id",
      links.map((l) => l.test_id),
    );
  const attempted = new Set(rows<{ test_id: string }>(resultRows).map((r) => r.test_id));

  const finished = dayIds.filter((dayId) => {
    const dayTests = links.filter((l) => l.day_id === dayId);
    return dayTests.length > 0 && dayTests.every((l) => attempted.has(l.test_id));
  });
  if (finished.length === 0) return;

  await db.from("discipline_completions").upsert(
    finished.map((dayId) => ({ user_id: userId, day_id: dayId, result_id: resultId })),
    { onConflict: "user_id,day_id", ignoreDuplicates: true },
  );

  // Recompute the student's place from the programme + their completions.
  const { data: dayRows } = await db
    .from("discipline_days")
    .select("id, day_number")
    .order("day_number", { ascending: true });
  const days = rows<{ id: string; day_number: number }>(dayRows);

  const { data: doneRows } = await db
    .from("discipline_completions")
    .select("day_id")
    .eq("user_id", userId);
  const doneIds = new Set(rows<{ day_id: string }>(doneRows).map((r) => r.day_id));

  const next = days.find((d) => !doneIds.has(d.id));
  // Programme finished: park them one past the last day so nothing re-locks.
  const currentDay = next?.day_number ?? (days.at(-1)?.day_number ?? 0) + 1;

  await db.from("discipline_members").update({ current_day: currentDay }).eq("user_id", userId);
}
