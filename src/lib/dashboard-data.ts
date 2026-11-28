import "server-only";
import { createClient } from "@/lib/supabase/server";
import { canAccessTrack } from "@/lib/levels";
import { isPremiumActive, trialDaysLeft } from "@/lib/premium";
import { passState, trialEndsAt, type PassState } from "@/lib/passes";
import { listMyReports } from "@/lib/writing-ai";
import { headlineBand } from "@/lib/writing-ai-shared";
import { rows, type Profile, type Result, type Test } from "@/types/database";
import { pickToday, passSuggestions, type PickInput, type TodayPick } from "@/lib/today-pick";
import { dayIn, greeting, todaysResults } from "@/lib/dashboard-shared";
import { listMocksForStudent, type StudentMockCard } from "@/lib/mock";
import type { DashboardReport } from "@/components/dashboard/writing-reports-card";

// One loader for the student dashboard (Today) and its Progress page.
//
// Everything is fetched in ONE Promise.all: the old page took ~10 sequential round trips (a
// second getUser + profile read, the writing reports awaited alone, trial checks after the
// catalogue, ...). The profile comes from the caller (requireProfile, which shares the (app)
// layout's per-request cache). Rank lookups are Progress-only: they scan every profile.

export type DashTest = Pick<
  Test,
  "id" | "slug" | "title" | "kind" | "tier" | "passage" | "question_types" | "difficulty" | "track" | "created_at"
>;
export type DashResult = Pick<
  Result,
  "id" | "skill" | "band" | "raw" | "total" | "submitted_at" | "test_id" | "rated" | "rating_after"
>;

export type DashboardData = {
  results: DashResult[];
  catalogue: DashTest[];
  reports: DashboardReport[];
  /** Latest AI writing check's band (Writing practice lives there, not in results). */
  writingBand: number | null;
  member: boolean;
  trialDays: number;
  /** This account has started the one-time trial at some point (it is never offered again). */
  hadTrial: boolean;
  /** Admin, Premium or trial: every Premium paper opens. */
  opensAll: boolean;
  /** Null when opensAll. */
  passes: PassState | null;
  pickInput: PickInput<DashTest>;
};

export async function loadDashboard(profile: Profile): Promise<DashboardData> {
  const supabase = await createClient();
  const member = profile.role === "admin" || isPremiumActive(profile);

  const [resultsRes, catalogueRes, reports, trialEnd, passes] = await Promise.all([
    supabase
      .from("results")
      .select("id, skill, band, raw, total, submitted_at, test_id, rated, rating_after")
      .eq("user_id", profile.id)
      .order("submitted_at", { ascending: false }),
    supabase
      .from("tests")
      .select("id, slug, title, kind, tier, passage, question_types, difficulty, track, created_at")
      .eq("skill", "reading")
      .order("created_at", { ascending: false }),
    // A failure here must never take the dashboard down.
    listMyReports(profile.id, 20)
      .then((r) => r.map((x) => ({ id: x.check.id, at: x.check.finished_at ?? x.check.created_at, results: x.check.results })))
      .catch(() => [] as DashboardReport[]),
    member ? Promise.resolve(null) : trialEndsAt(profile.id).catch(() => null),
    member ? Promise.resolve(null) : passState(profile.id).catch(() => null),
  ]);

  const results = rows<DashResult>(resultsRes.data);
  const catalogue = rows<DashTest>(catalogueRes.data).filter((t) => canAccessTrack(profile, t.track));
  const trialDays = trialDaysLeft(trialEnd);
  const opensAll = member || trialDays > 0;
  const passesOrNull = opensAll ? null : (passes ?? { left: 0, testIds: new Set<string>() });

  return {
    results,
    catalogue,
    reports,
    writingBand: reports.length ? headlineBand(reports[0].results) : null,
    member,
    trialDays,
    hadTrial: trialEnd != null,
    opensAll,
    passes: passesOrNull,
    pickInput: {
      catalogue,
      results: results.map((r) => ({ test_id: r.test_id, skill: r.skill, raw: r.raw, total: r.total })),
      rating: profile.rating ?? 1000,
      opensAll,
      passes: passesOrNull,
    },
  };
}

export type TodayView = {
  pick: TodayPick<DashTest> | null;
  /** Results from today in the student's zone (newest first). */
  doneToday: DashResult[];
  passPicks: DashTest[];
  /** Today's date (YYYY-MM-DD) and greeting in the student's zone. */
  day: string;
  greeting: string;
  /** A result OR a writing check today: the streak is safe. */
  practisedToday: boolean;
};

// The clock is read here, not in the page: components must stay pure (react-hooks/purity).
export function todayView(profile: Profile, d: DashboardData, now: number = Date.now()): TodayView {
  const tz = profile.timezone || "UTC";
  const pick = pickToday(d.pickInput);
  const doneToday = todaysResults(d.results, tz, now);
  const day = dayIn(now, tz);
  return {
    pick,
    doneToday,
    passPicks: passSuggestions(d.pickInput, new Set(pick ? [pick.test.id] : [])),
    day,
    greeting: greeting(tz, now),
    practisedToday: doneToday.length > 0 || d.reports.some((r) => dayIn(r.at, tz) === day),
  };
}

export type MockStatus = {
  mockId: string;
  mockTitle: string;
  title: string;
  body: string;
  cta: string;
};

const FRESH_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * The one mock-exam line worth showing on Today: a sitting in progress, a place waiting,
 * a paper being marked, or a result released in the last 14 days. Null otherwise.
 */
export async function loadMockStatus(userId: string, now: number = Date.now()): Promise<MockStatus | null> {
  const cards: StudentMockCard[] = await listMocksForStudent(userId).catch(() => []);
  const ranked = cards
    .map((c) => {
      const a = c.attempt;
      if (!a) return null;
      const base = { mockId: c.mock.id, mockTitle: c.mock.title };
      if (a.status === "in_progress")
        return { ...base, rank: 0, title: "Your mock exam is in progress", cta: "Continue",
          body: a.current_minutes_left != null ? `${a.current_minutes_left} min left on the clock.` : "Continue where you stopped." };
      if (a.status === "approved")
        return { ...base, rank: 1, title: "Your mock exam place is ready", cta: "Open",
          body: c.mock.session_state === "running" ? "The session is open. You can start now." : "You can start when the session opens." };
      if (a.status === "submitted")
        return { ...base, rank: 2, title: "Your mock is being marked", cta: "View", body: "We'll email your result when it's released." };
      if (a.status === "released" && a.released_at && now - new Date(a.released_at).getTime() < FRESH_MS)
        return { ...base, rank: 3, title: "Your mock result is out", cta: "See result",
          body: a.result?.overall != null ? `Overall band ${a.result.overall}.` : "See your bands and review your papers." };
      return null;
    })
    .filter((x): x is NonNullable<typeof x> => x != null)
    .sort((x, y) => x.rank - y.rank);
  if (!ranked.length) return null;
  const { rank: _rank, ...item } = ranked[0];
  void _rank;
  return item;
}
