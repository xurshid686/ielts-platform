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

// --------------------------------------------------------------- progress

export type GridCellTest = {
  testId: string;
  title: string;
  skill: "reading" | "listening";
  raw: number | null;
  total: number | null;
  band: number | null;
  at: string | null;
};

export type GridRow = {
  userId: string;
  name: string | null;
  email: string | null;
  currentDay: number;
  strikes: number;
  /** ISO date of their most recent Discipline submission, null if never. */
  lastActivity: string | null;
  inactive: boolean;
  trailing: boolean;
  /** day id -> one entry per test attached to that day, in display order. */
  cells: Record<string, GridCellTest[]>;
};

export type ProgressGrid = {
  days: { id: string; day_number: number; title: string | null }[];
  rows: GridRow[];
  /** The group's median current day — what "trailing" is measured against. */
  medianDay: number;
};

/**
 * The admin progress grid: every member a row, every day a column.
 *
 * Scores are the student's FIRST attempt at each test, matching how the rating
 * ladder treats an attempt (`apply_rating` only rates a first attempt), so the
 * grid and the leaderboard cannot tell two different stories about the same
 * paper.
 *
 * Service-role, because it reads every member's results. Gate the caller.
 */
export async function loadProgressGrid(inactiveDays = 3): Promise<ProgressGrid> {
  const db = createAdminClient();

  const [{ data: dayRows }, { data: memberRows }] = await Promise.all([
    db.from("discipline_days").select("id, day_number, title").order("day_number"),
    db.from("discipline_members").select("user_id, current_day, strikes"),
  ]);

  const days = rows<{ id: string; day_number: number; title: string | null }>(dayRows);
  const members = rows<{ user_id: string; current_day: number; strikes: number }>(memberRows);
  if (members.length === 0 || days.length === 0) {
    return { days, rows: [], medianDay: 0 };
  }

  const [{ data: linkRows }, { data: profileRows }] = await Promise.all([
    db
      .from("discipline_day_tests")
      .select("day_id, test_id, position")
      .in(
        "day_id",
        days.map((d) => d.id),
      ),
    db
      .from("profiles")
      .select("id, name, email")
      .in(
        "id",
        members.map((m) => m.user_id),
      ),
  ]);

  const links = rows<{ day_id: string; test_id: string; position: number }>(linkRows).sort(
    (a, b) => a.position - b.position,
  );
  const profiles = new Map(
    rows<{ id: string; name: string | null; email: string | null }>(profileRows).map((p) => [
      p.id,
      p,
    ]),
  );

  const testIds = [...new Set(links.map((l) => l.test_id))];
  const testMeta = new Map<string, { title: string; skill: "reading" | "listening" }>();
  if (testIds.length > 0) {
    const { data: testRows } = await db
      .from("tests")
      .select("id, title, skill")
      .in("id", testIds);
    for (const t of rows<{ id: string; title: string; skill: "reading" | "listening" }>(testRows)) {
      testMeta.set(t.id, { title: t.title, skill: t.skill });
    }
  }

  // Ascending by date, so the FIRST row seen for a (user, test) pair is their
  // first attempt — later retakes are ignored rather than overwriting it.
  const first = new Map<string, { raw: number | null; total: number | null; band: number | null; at: string }>();
  const lastActivity = new Map<string, string>();
  if (testIds.length > 0) {
    const { data: resultRows } = await db
      .from("results")
      .select("user_id, test_id, raw, total, band, submitted_at")
      .in(
        "user_id",
        members.map((m) => m.user_id),
      )
      .in("test_id", testIds)
      .order("submitted_at", { ascending: true });

    for (const r of rows<{
      user_id: string;
      test_id: string;
      raw: number | null;
      total: number | null;
      band: number | null;
      submitted_at: string;
    }>(resultRows)) {
      const key = `${r.user_id}:${r.test_id}`;
      if (!first.has(key)) {
        first.set(key, { raw: r.raw, total: r.total, band: r.band, at: r.submitted_at });
      }
      lastActivity.set(r.user_id, r.submitted_at); // ascending, so the last wins
    }
  }

  const sortedDays = [...members].map((m) => m.current_day).sort((a, b) => a - b);
  const mid = Math.floor(sortedDays.length / 2);
  const medianDay =
    sortedDays.length % 2 === 0
      ? Math.round((sortedDays[mid - 1] + sortedDays[mid]) / 2)
      : sortedDays[mid];

  const cutoff = Date.now() - inactiveDays * 24 * 60 * 60 * 1000;

  const gridRows: GridRow[] = members.map((m) => {
    const cells: Record<string, GridCellTest[]> = {};
    for (const d of days) {
      cells[d.id] = links
        .filter((l) => l.day_id === d.id)
        .map((l) => {
          const meta = testMeta.get(l.test_id);
          const r = first.get(`${m.user_id}:${l.test_id}`);
          return {
            testId: l.test_id,
            title: meta?.title ?? "(test removed)",
            skill: meta?.skill ?? "reading",
            raw: r?.raw ?? null,
            total: r?.total ?? null,
            band: r?.band ?? null,
            at: r?.at ?? null,
          };
        });
    }
    const last = lastActivity.get(m.user_id) ?? null;
    return {
      userId: m.user_id,
      name: profiles.get(m.user_id)?.name ?? null,
      email: profiles.get(m.user_id)?.email ?? null,
      currentDay: m.current_day,
      strikes: m.strikes,
      lastActivity: last,
      // Never started counts as inactive too — that is exactly who needs chasing.
      inactive: !last || new Date(last).getTime() < cutoff,
      trailing: m.current_day < medianDay,
      cells,
    };
  });

  gridRows.sort((a, b) => (a.name ?? a.email ?? "").localeCompare(b.name ?? b.email ?? ""));
  return { days, rows: gridRows, medianDay };
}
