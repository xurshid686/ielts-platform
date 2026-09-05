import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rows } from "@/types/database";

// Re-exported so server code has one import for the feature; the constant lives
// in a client-safe module because the admin UI is a client component.
export { STRIKE_LIMIT } from "@/lib/discipline-shared";
import {
  countsAfterReset,
  deadlineLabel,
  deadlineState,
  deriveDayStatus,
  isOverdueFor,
} from "@/lib/discipline-shared";

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
  /** false = a draft the owner is still building. Students never see it. */
  published: boolean;
  /** An absolute instant, or null for a day with no deadline (0048). */
  due_at: string | null;
  tests: DisciplineTest[];
};

/** A student's first counting attempt at one test. */
export type Attempt = {
  resultId: string | null;
  raw: number | null;
  total: number | null;
  band: number | null;
  at: string;
};

// ---------------------------------------------------------------------------
// PROGRESS IS DERIVED, NOT STORED.
//
// It used to live in `discipline_members.current_day` and the
// `discipline_completions` table, both written only when a test was submitted.
// Any programme edit then left them lying: deleting a day cascaded its
// completion rows away but left the counter past the end of the programme, so a
// student with one Day 1 in front of them was told they were on "Day 2".
//
// So the rule below is computed fresh on every read, and it is the ONLY
// definition of "done" in the codebase — the student's page, the admin grid and
// the post-submission recorder all go through it:
//
//   * a TEST is done when the student has a `results` row for it dated at or
//     after their `reset_at` (any row, when they have never been reset);
//   * the score shown is their FIRST such attempt, matching `apply_rating`,
//     which only rates a first attempt — so a re-do never rewrites history;
//   * a DRAFT day (0047) is not part of the programme at all — not for the
//     student, and not for the admin grid or the recorder. It is invisible to
//     the rule, so building next week's days changes nobody's current day;
//   * a DAY is complete when it has at least one test and every one is done;
//   * the CURRENT DAY is the lowest incomplete day, or the last day once the
//     programme is finished. It is never a day that does not exist.
//
// Because a reset is a cutoff DATE rather than a deletion, resetting a student
// costs them their progress without touching their results, XP or rating.
// ---------------------------------------------------------------------------

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
export async function loadProgramme(includeDrafts = false): Promise<DisciplineDay[]> {
  const supabase = await createClient();

  let req = supabase
    .from("discipline_days")
    .select("id, day_number, title, instructions, published, due_at");
  if (!includeDrafts) req = req.eq("published", true);
  const { data: dayRows } = await req.order("day_number", { ascending: true });

  return assembleDays(dayRows, async (ids) => {
    const { data } = await supabase
      .from("discipline_day_tests")
      .select("day_id, test_id, position")
      .in("day_id", ids);
    return data;
  }, async (ids) => {
    const { data } = await supabase
      .from("tests")
      .select("id, slug, title, skill, total, track")
      .in("id", ids);
    return data;
  });
}

/**
 * `loadProgramme()` with the service-role client.
 *
 * The grid and the recorder run over every member, so they cannot use the
 * caller's RLS-scoped client for a student-facing read.
 */
async function loadProgrammeAsAdmin(includeDrafts = false): Promise<DisciplineDay[]> {
  const db = createAdminClient();
  let req = db
    .from("discipline_days")
    .select("id, day_number, title, instructions, published, due_at");
  if (!includeDrafts) req = req.eq("published", true);
  const { data: dayRows } = await req.order("day_number", { ascending: true });

  return assembleDays(dayRows, async (ids) => {
    const { data } = await db
      .from("discipline_day_tests")
      .select("day_id, test_id, position")
      .in("day_id", ids);
    return data;
  }, async (ids) => {
    const { data } = await db.from("tests").select("id, slug, title, skill, total, track").in("id", ids);
    return data;
  });
}

/** Shared shape-building for the two loaders above, so they cannot drift. */
async function assembleDays(
  dayRows: unknown[] | null,
  fetchLinks: (dayIds: string[]) => Promise<unknown[] | null>,
  fetchTests: (testIds: string[]) => Promise<unknown[] | null>,
): Promise<DisciplineDay[]> {
  const days = rows<{
    id: string;
    day_number: number;
    title: string | null;
    instructions: string | null;
    published: boolean;
    due_at: string | null;
  }>(dayRows);
  if (days.length === 0) return [];

  const links = rows<{ day_id: string; test_id: string; position: number }>(
    await fetchLinks(days.map((d) => d.id)),
  );
  if (links.length === 0) return days.map((d) => ({ ...d, tests: [] }));

  const testsById = new Map(
    rows<{
      id: string;
      slug: string | null;
      title: string;
      skill: "reading" | "listening";
      total: number | null;
      track: string;
    }>(await fetchTests(links.map((l) => l.test_id))).map((t) => [t.id, t]),
  );

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

/**
 * First counting attempt per (user, test), keyed `${userId}:${testId}`.
 *
 * Rows come back ascending, so the first one seen for a pair is the earliest —
 * later retakes are ignored rather than overwriting it. A row dated before the
 * student's `reset_at` is skipped entirely: it belongs to a previous run at the
 * challenge, which is what lets Reset take their progress without deleting a
 * single scored record.
 */
async function loadFirstAttempts(
  userIds: string[],
  testIds: string[],
  resetAtByUser: Map<string, string | null>,
): Promise<{ first: Map<string, Attempt>; lastActivity: Map<string, string> }> {
  const first = new Map<string, Attempt>();
  const lastActivity = new Map<string, string>();
  if (userIds.length === 0 || testIds.length === 0) return { first, lastActivity };

  const db = createAdminClient();
  const { data } = await db
    .from("results")
    .select("id, user_id, test_id, raw, total, band, submitted_at")
    .in("user_id", userIds)
    .in("test_id", testIds)
    .order("submitted_at", { ascending: true });

  for (const r of rows<{
    id: string;
    user_id: string;
    test_id: string;
    raw: number | null;
    total: number | null;
    band: number | null;
    submitted_at: string;
  }>(data)) {
    if (!countsAfterReset(r.submitted_at, resetAtByUser.get(r.user_id) ?? null)) continue;

    const key = `${r.user_id}:${r.test_id}`;
    if (!first.has(key)) {
      first.set(key, {
        resultId: r.id,
        raw: r.raw,
        total: r.total,
        band: r.band,
        at: r.submitted_at,
      });
    }
    lastActivity.set(r.user_id, r.submitted_at); // ascending, so the last wins
  }
  return { first, lastActivity };
}

/**
 * Adapter over the tested rule in discipline-shared.ts: turns the first-attempt
 * map into the set of test ids this student has done, then applies it.
 */
function deriveDays(
  days: { tests: { id: string }[] }[],
  userId: string,
  first: Map<string, Attempt>,
): { complete: boolean[]; currentIndex: number } {
  const done = new Set<string>();
  for (const d of days) {
    for (const t of d.tests) if (first.has(`${userId}:${t.id}`)) done.add(t.id);
  }
  return deriveDayStatus(days, done);
}

// ------------------------------------------------------------- student view

export type StudentTest = DisciplineTest & { attempt: Attempt | null };

export type StudentDay = Omit<DisciplineDay, "tests"> & {
  tests: StudentTest[];
  complete: boolean;
  locked: boolean;
  /** "3 days left" / "2 days late", or null when the day has no deadline. */
  deadline: string | null;
  /** Past its deadline and not finished. Derived, never stored. */
  overdue: boolean;
};

export type StudentProgress = {
  days: StudentDay[];
  /** The day to show in the header — never one that does not exist. */
  currentDay: number;
  totalDays: number;
  finished: boolean;
};

export async function loadStudentProgress(
  userId: string,
  resetAt: string | null,
  /** Admins previewing the programme see every day unlocked. */
  preview = false,
): Promise<StudentProgress> {
  // An admin previewing sees drafts too, flagged as drafts, so they can check a
  // day before publishing it. A member's RLS policy would refuse them anyway.
  const days = await loadProgramme(preview);
  const testIds = [...new Set(days.flatMap((d) => d.tests.map((t) => t.id)))];
  const { first } = await loadFirstAttempts([userId], testIds, new Map([[userId, resetAt]]));
  const { complete, currentIndex } = deriveDays(days, userId, first);

  const now = new Date();

  return {
    days: days.map((d, i) => ({
      ...d,
      tests: d.tests.map((t) => ({ ...t, attempt: first.get(`${userId}:${t.id}`) ?? null })),
      complete: complete[i],
      locked: preview ? false : i > currentIndex,
      // Shown on locked days too: a student should be able to see what is
      // coming and plan for it, not discover the deadline on the day.
      deadline: deadlineLabel(deadlineState(d.due_at, now)),
      overdue: isOverdueFor(d, complete[i], now),
    })),
    currentDay: currentIndex === -1 ? 0 : days[currentIndex].day_number,
    totalDays: days.length,
    finished: days.length > 0 && complete.every(Boolean),
  };
}

// --------------------------------------------------------------- admin view

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
  /** Derived, like everything else here — not `discipline_members.current_day`. */
  currentDay: number;
  totalDays: number;
  completedDays: number;
  strikes: number;
  /** ISO date of their most recent counting submission, null if never. */
  lastActivity: string | null;
  inactive: boolean;
  trailing: boolean;
  /**
   * Has at least one day past its deadline that they have not finished.
   * A FACT, where `inactive` is only a proxy — that one says "has been quiet",
   * this one says "has missed something you set".
   */
  overdue: boolean;
  /** day id -> one entry per test attached to that day, in display order. */
  cells: Record<string, GridCellTest[]>;
};

export type ProgressGrid = {
  days: { id: string; day_number: number; title: string | null; due_at: string | null }[];
  rows: GridRow[];
  /** The group's median current day — what "trailing" is measured against. */
  medianDay: number;
};

/**
 * The admin progress grid: every member a row, every day a column.
 *
 * Also the source for the Members tab, so it must return member rows even when
 * the programme is still empty — the list must not vanish before day one exists.
 *
 * Service-role, because it reads every member's results. Gate the caller.
 *
 * PUBLISHED DAYS ONLY. The grid measures the same ladder the students walk, so
 * a draft column here would report everyone as stuck on a day they cannot see.
 */
export async function loadProgressGrid(inactiveDays = 3): Promise<ProgressGrid> {
  const db = createAdminClient();

  const [programme, { data: memberRows }] = await Promise.all([
    loadProgrammeAsAdmin(),
    db.from("discipline_members").select("user_id, strikes, reset_at"),
  ]);

  const members = rows<{ user_id: string; strikes: number; reset_at: string | null }>(memberRows);
  const days = programme.map((d) => ({
    id: d.id,
    day_number: d.day_number,
    title: d.title,
    due_at: d.due_at,
  }));
  if (members.length === 0) return { days, rows: [], medianDay: 0 };

  const { data: profileRows } = await db
    .from("profiles")
    .select("id, name, email")
    .in(
      "id",
      members.map((m) => m.user_id),
    );
  const profiles = new Map(
    rows<{ id: string; name: string | null; email: string | null }>(profileRows).map((p) => [
      p.id,
      p,
    ]),
  );

  const testIds = [...new Set(programme.flatMap((d) => d.tests.map((t) => t.id)))];
  const { first, lastActivity } = await loadFirstAttempts(
    members.map((m) => m.user_id),
    testIds,
    new Map(members.map((m) => [m.user_id, m.reset_at])),
  );

  const derived = members.map((m) => ({ member: m, ...deriveDays(programme, m.user_id, first) }));

  const sorted = derived
    .map((d) => (d.currentIndex === -1 ? 0 : programme[d.currentIndex].day_number))
    .sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const medianDay =
    sorted.length === 0
      ? 0
      : sorted.length % 2 === 0
        ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
        : sorted[mid];

  const cutoff = Date.now() - inactiveDays * 24 * 60 * 60 * 1000;
  // One clock for the whole grid, so no two rows are judged microseconds apart.
  const now = new Date();

  const gridRows: GridRow[] = derived.map(({ member: m, complete, currentIndex }) => {
    const cells: Record<string, GridCellTest[]> = {};
    for (const d of programme) {
      cells[d.id] = d.tests.map((t) => {
        const a = first.get(`${m.user_id}:${t.id}`);
        return {
          testId: t.id,
          title: t.title,
          skill: t.skill,
          raw: a?.raw ?? null,
          total: a?.total ?? null,
          band: a?.band ?? null,
          at: a?.at ?? null,
        };
      });
    }
    const last = lastActivity.get(m.user_id) ?? null;
    const currentDay = currentIndex === -1 ? 0 : programme[currentIndex].day_number;
    return {
      userId: m.user_id,
      name: profiles.get(m.user_id)?.name ?? null,
      email: profiles.get(m.user_id)?.email ?? null,
      currentDay,
      totalDays: programme.length,
      completedDays: complete.filter(Boolean).length,
      strikes: m.strikes,
      lastActivity: last,
      // Never started counts as inactive too — that is exactly who needs chasing.
      inactive: !last || new Date(last).getTime() < cutoff,
      trailing: currentDay < medianDay,
      overdue: programme.some((d, i) => isOverdueFor(d, complete[i], now)),
      cells,
    };
  });

  gridRows.sort((a, b) => (a.name ?? a.email ?? "").localeCompare(b.name ?? b.email ?? ""));
  return { days, rows: gridRows, medianDay };
}

// ------------------------------------------------------------ attaching

/**
 * Put a test on a day, at the end of that day's list.
 *
 * ONE COPY, because there are two upload doors — the day card on
 * /admin/discipline and the "Discipline challenge only" option on /admin/tests —
 * and a paper that lands on no day is invisible to every student. That is
 * exactly what happened to a listening paper on 2026-09-05: the /admin/tests
 * form set the track and attached nothing, so the upload silently went nowhere.
 *
 * Authorisation-free by design, like createTestFromHtml(): it writes with the
 * service-role client because 0046 grants no client role INSERT here, and it
 * trusts its CALLERS to have gated. Do not call it from anywhere ungated.
 */
export async function attachTestToDay(
  dayId: string,
  testId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = createAdminClient();

  const { data: existing, error: readErr } = await db
    .from("discipline_day_tests")
    .select("test_id")
    .eq("day_id", dayId);
  if (readErr) return { ok: false, error: readErr.message };

  const { error } = await db
    .from("discipline_day_tests")
    .insert({ day_id: dayId, test_id: testId, position: rows<{ test_id: string }>(existing).length });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// -------------------------------------------------------------- the recorder

/**
 * Called after a result is saved, to keep the audit trail current.
 *
 * NOTHING READS WHAT THIS WRITES any more. `discipline_completions` is history
 * (it carries a real `completed_at` and the result that finished the day) and
 * `discipline_members.current_day` is a convenience cache for anyone querying
 * the database directly. Display and gating are derived — see the note at the
 * top of this file. That is also why a failure here is logged and swallowed by
 * the caller: it can no longer strand a student.
 *
 * Written with the SERVICE-ROLE client because these tables grant no writes to
 * any client role (0046), and `userId` comes from the caller's verified session.
 */
export async function recordDisciplineProgress(
  userId: string,
  testId: string,
  resultId: string | null,
): Promise<void> {
  const db = createAdminClient();

  const { data: memberRow } = await db
    .from("discipline_members")
    .select("user_id, reset_at")
    .eq("user_id", userId)
    .maybeSingle();
  const member = memberRow as { user_id: string; reset_at: string | null } | null;
  if (!member) return; // not in the challenge — nothing to record

  const { data: linkRows } = await db
    .from("discipline_day_tests")
    .select("day_id")
    .eq("test_id", testId);
  if (rows<{ day_id: string }>(linkRows).length === 0) return; // not part of the programme

  // Published only, for the same reason the grid is: progress is measured over
  // the ladder the student can actually walk.
  const programme = await loadProgrammeAsAdmin();
  const testIds = [...new Set(programme.flatMap((d) => d.tests.map((t) => t.id)))];
  const { first } = await loadFirstAttempts([userId], testIds, new Map([[userId, member.reset_at]]));
  const { complete, currentIndex } = deriveDays(programme, userId, first);

  const finished = programme.filter((_, i) => complete[i]);
  if (finished.length > 0) {
    await db.from("discipline_completions").upsert(
      finished.map((d) => ({ user_id: userId, day_id: d.id, result_id: resultId })),
      { onConflict: "user_id,day_id", ignoreDuplicates: true },
    );
  }

  await db
    .from("discipline_members")
    .update({ current_day: currentIndex === -1 ? 1 : programme[currentIndex].day_number })
    .eq("user_id", userId);
}

// ------------------------------------------------------- the Members tab

export type DisciplineMemberRow = {
  user_id: string;
  email: string | null;
  name: string | null;
  /** Derived from their results, not read from discipline_members.current_day. */
  current_day: number;
  total_days: number;
  completed: number;
  strikes: number;
  last_activity: string | null;
};

/**
 * The Members tab, projected from the SAME grid the Progress tab renders.
 *
 * Not a query of its own: the grid already applies the one definition of "done"
 * (see the note at the top of lib/discipline.ts), and the two tabs must never
 * disagree about which day a student is on. That disagreement is the bug this
 * replaced — a stored counter saying Day 2 while the programme held a single
 * Day 1. Pure, so the page computes the grid once.
 */
export function membersFromGrid(grid: ProgressGrid): DisciplineMemberRow[] {
  return grid.rows.map((r) => ({
    user_id: r.userId,
    email: r.email,
    name: r.name,
    current_day: r.currentDay,
    total_days: r.totalDays,
    completed: r.completedDays,
    strikes: r.strikes,
    last_activity: r.lastActivity,
  }));
}
