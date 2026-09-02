import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { fmtOverview, fmtStats, type OverviewCounts, type StatsView } from "../format";
import { encodeCb } from "../callback";
import type { InlineKeyboard } from "../types";

// Read-only. Every query names its columns: `select("*")` on `results` pulls
// each student's whole 40-question answer map, and CLAUDE.md removed that
// pattern from the dashboard for exactly this reason.

export type Period = "today" | "week" | "month" | "all";

const PERIODS: Record<Period, { label: string; days: number | null }> = {
  today: { label: "Today", days: 1 },
  week: { label: "Last 7 days", days: 7 },
  month: { label: "Last 30 days", days: 30 },
  all: { label: "All time", days: null },
};

export function isPeriod(v: string | undefined): v is Period {
  return v === "today" || v === "week" || v === "month" || v === "all";
}

function cutoff(days: number | null): string | null {
  if (days === null) return null;
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

export function mainMenu(): InlineKeyboard {
  return [
    [
      { text: "📊 Stats", callback_data: encodeCb("stats", "week") },
      { text: "👥 Students", callback_data: encodeCb("students") },
    ],
    [
      { text: "🧪 Tests", callback_data: encodeCb("tests") },
      { text: "⬆️ Upload test", callback_data: encodeCb("upload") },
    ],
  ];
}

export function statsMenu(active: Period): InlineKeyboard {
  const tab = (p: Period, text: string) => ({
    // The active tab is marked rather than removed, so the row never reflows
    // under the thumb between taps.
    text: p === active ? `· ${text} ·` : text,
    callback_data: encodeCb("stats", p),
  });
  return [
    [tab("today", "Today"), tab("week", "Week"), tab("month", "Month"), tab("all", "All")],
    [{ text: "‹ Menu", callback_data: encodeCb("menu") }],
  ];
}

/** The /start card: the same four numbers as /admin, plus today's activity. */
export async function buildOverview(): Promise<string> {
  const db = createAdminClient();
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  const nowIso = new Date().toISOString();

  const [students, tests, results, streaks, premium, todayAttempts, todayStudents] =
    await Promise.all([
      db.from("profiles").select("id", { count: "exact", head: true }),
      db.from("tests").select("id", { count: "exact", head: true }),
      db.from("results").select("id", { count: "exact", head: true }),
      db.from("profiles").select("id", { count: "exact", head: true }).gt("streak", 0),
      db.from("profiles").select("id", { count: "exact", head: true }).gt("premium_until", nowIso),
      db.from("results").select("id", { count: "exact", head: true }).gte("submitted_at", dayAgo),
      db.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", dayAgo),
    ]);

  const counts: OverviewCounts = {
    students: students.count ?? 0,
    tests: tests.count ?? 0,
    results: results.count ?? 0,
    activeStreaks: streaks.count ?? 0,
    premium: premium.count ?? 0,
    attemptsToday: todayAttempts.count ?? 0,
    newStudentsToday: todayStudents.count ?? 0,
  };

  return fmtOverview(counts);
}

/** The stats card for one period. */
export async function buildStats(period: Period): Promise<string> {
  const db = createAdminClient();
  const { label, days } = PERIODS[period];
  const from = cutoff(days);
  const nowIso = new Date().toISOString();

  // The immediately preceding window of the same length, for the ▲/▼ delta.
  // "All time" has no prior period, so the delta is suppressed.
  const prevFrom = days === null ? null : new Date(Date.now() - days * 2 * 86_400_000).toISOString();

  let attemptsQ = db.from("results").select("band, skill, user_id");
  if (from) attemptsQ = attemptsQ.gte("submitted_at", from);

  let newStudentsQ = db.from("profiles").select("id", { count: "exact", head: true });
  if (from) newStudentsQ = newStudentsQ.gte("created_at", from);

  const [attempts, newStudents, students, tests, streaks, premium, prev] = await Promise.all([
    attemptsQ,
    newStudentsQ,
    db.from("profiles").select("id", { count: "exact", head: true }),
    db.from("tests").select("id", { count: "exact", head: true }),
    db.from("profiles").select("id", { count: "exact", head: true }).gt("streak", 0),
    db.from("profiles").select("id", { count: "exact", head: true }).gt("premium_until", nowIso),
    prevFrom && from
      ? db
          .from("results")
          .select("id", { count: "exact", head: true })
          .gte("submitted_at", prevFrom)
          .lt("submitted_at", from)
      : Promise.resolve({ count: null }),
  ]);

  const rows = (attempts.data ?? []) as {
    band: number | null;
    skill: string | null;
    user_id: string | null;
  }[];

  const bands = rows.map((r) => r.band).filter((b): b is number => typeof b === "number");
  const avgBand = bands.length ? bands.reduce((a, b) => a + b, 0) / bands.length : null;
  const bestBand = bands.length ? Math.max(...bands) : null;

  // Per-student tallies in ONE pass. The catalogue used to do a filter per
  // test — O(tests × attempts) — and CLAUDE.md calls that out; the same trap
  // applies here at O(students × attempts).
  const byUser = new Map<string, { attempts: number; total: number; scored: number }>();
  for (const r of rows) {
    if (!r.user_id) continue;
    const acc = byUser.get(r.user_id) ?? { attempts: 0, total: 0, scored: 0 };
    acc.attempts += 1;
    if (typeof r.band === "number") {
      acc.total += r.band;
      acc.scored += 1;
    }
    byUser.set(r.user_id, acc);
  }

  const topIds = [...byUser.entries()]
    .sort((a, b) => b[1].attempts - a[1].attempts)
    .slice(0, 5);

  let top: StatsView["top"] = [];
  if (topIds.length > 0) {
    const { data: people } = await db
      .from("profiles")
      .select("id, name, email")
      .in(
        "id",
        topIds.map(([id]) => id),
      );
    const nameById = new Map(
      ((people ?? []) as { id: string; name: string | null; email: string | null }[]).map((p) => [
        p.id,
        p.name || p.email || "Unknown",
      ]),
    );
    top = topIds.map(([id, acc]) => ({
      name: nameById.get(id) ?? "Unknown",
      attempts: acc.attempts,
      avg: acc.scored ? acc.total / acc.scored : null,
    }));
  }

  const view: StatsView = {
    label,
    students: students.count ?? 0,
    newStudents: newStudents.count ?? 0,
    tests: tests.count ?? 0,
    attempts: rows.length,
    prevAttempts: prev.count ?? null,
    reading: rows.filter((r) => r.skill === "reading").length,
    listening: rows.filter((r) => r.skill === "listening").length,
    avgBand,
    bestBand,
    activeStreaks: streaks.count ?? 0,
    premium: premium.count ?? 0,
    top,
  };

  return fmtStats(view);
}
