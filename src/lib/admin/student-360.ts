import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { liveStreak } from "@/lib/day";
import { membershipStage, type MembershipStage } from "@/lib/premium";

// Everything about one student, for /admin/members/[id] (admin panel v2).
//
// Service role, authorisation-free: the PAGE gates with requireAdmin() and is
// the only caller. Read-only. Every query names its columns — never
// `results.answers`, which is a 40-question map per row.
//
// Several tables here (payment_orders, premium_passes, premium_trials,
// ultima_members, test_reports, student_bot_links) are newer than the
// generated types, so this goes through an untyped client (the lib/passes.ts
// stopgap) and narrows each list below.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any;

const RESULTS_SHOWN = 300;

export type S360 = {
  profile: {
    id: string;
    email: string | null;
    name: string | null;
    avatar_url: string | null;
    role: string;
    is_owner: boolean;
    level: string;
    created_at: string;
    timezone: string | null;
    xp: number;
    streak: number;
    longest_streak: number;
    last_activity_date: string | null;
    rating: number;
    peak_rating: number;
    rated_count: number;
    hidden_from_leaderboard: boolean;
    target_band: number | null;
    premium_until: string | null;
    email_reminders: boolean | null;
  };
  membership: { stage: MembershipStage; days: number };
  ultima: { until: string; active: boolean; granted_at: string } | null;
  trial: { started_at: string; ends_at: string; active: boolean } | null;
  stats: {
    total_attempts: number;
    reading_attempts: number;
    best_band: number | null;
    first_attempt_avg_band: number | null;
    accuracy: number | null;
  };
  results: {
    id: string;
    test_id: string | null;
    title: string;
    skill: string;
    raw: number | null;
    total: number | null;
    band: number | null;
    duration_seconds: number | null;
    flagged: boolean | null;
    flag_reason: string | null;
    rated: boolean | null;
    rating_delta: number | null;
    submitted_at: string;
  }[];
  resultsTotal: number;
  mocks: {
    id: string;
    title: string;
    status: string;
    listening_band: number | null;
    reading_band: number | null;
    writing_band: number | null;
    overall_band: number | null;
    submitted_at: string | null;
    released_at: string | null;
    created_at: string;
  }[];
  writing: { id: string; kind: string; topic: string | null; word_count: number | null; word_count2: number | null; started_at: string; submitted_at: string | null }[];
  speaking: { id: string; topic: string | null; score: number | null; created_at: string }[];
  orders: { id: string; plan: string; months: number; amount: number; provider: string; status: string; paid_at: string | null; refunded_at: string | null; created_at: string }[];
  passes: { test_id: string; title: string; week_start: string; created_at: string }[];
  reports: { id: string; title: string; category: string; status: string; message: string; created_at: string; rewarded: boolean }[];
  discipline: { granted_at: string; strikes: number; reset_at: string | null } | null;
  emails: { kind: string; sent_day: string; status: string; error: string | null }[];
  bot: { daily_on: boolean; linked_at: string } | null;
  /** YYYY-MM-DD of every scored attempt, for the heatmap. */
  activityDates: string[];
};

function must<T>(label: string, r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(`[student-360] ${label}: ${r.error.message}`);
  return (r.data ?? ([] as unknown as T)) as T;
}

export async function loadStudent360(id: string): Promise<S360 | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const c = db();

  const profRes = await c
    .from("profiles")
    .select(
      "id, email, name, avatar_url, role, is_owner, level, created_at, timezone, xp, streak, longest_streak, last_activity_date, rating, peak_rating, rated_count, hidden_from_leaderboard, target_band, premium_until, email_reminders",
    )
    .eq("id", id)
    .maybeSingle();
  if (profRes.error) throw new Error(`[student-360] profile: ${profRes.error.message}`);
  if (!profRes.data) return null;
  const p = profRes.data as S360["profile"];

  const [
    statsR,
    resultsR,
    resultsCountR,
    datesR,
    mocksR,
    writingR,
    speakingR,
    ordersR,
    passesR,
    trialR,
    ultimaR,
    reportsR,
    disciplineR,
    emailsR,
    botR,
  ] = await Promise.all([
    c.from("profile_stats").select("total_attempts, reading_attempts, best_band, first_attempt_avg_band, total_correct, total_questions").eq("id", id).maybeSingle(),
    c
      .from("results")
      .select("id, test_id, skill, raw, total, band, duration_seconds, flagged, flag_reason, rated, rating_delta, submitted_at, tests(title)")
      .eq("user_id", id)
      .order("submitted_at", { ascending: false })
      .limit(RESULTS_SHOWN),
    c.from("results").select("id", { count: "exact", head: true }).eq("user_id", id),
    c.from("results").select("submitted_at").eq("user_id", id).gte("submitted_at", new Date(Date.now() - 370 * 86400000).toISOString()).limit(1000),
    c
      .from("mock_attempts")
      .select("id, status, listening_band, reading_band, writing_band, overall_band, submitted_at, released_at, created_at, mocks(title)")
      .eq("user_id", id)
      .order("created_at", { ascending: false }),
    c
      .from("writing_practice_attempts")
      .select("id, kind, topic, word_count, word_count2, started_at, submitted_at")
      .eq("user_id", id)
      .order("started_at", { ascending: false })
      .limit(200),
    c.from("speaking_submissions").select("id, topic, score, created_at").eq("user_id", id).order("created_at", { ascending: false }).limit(100),
    c
      .from("payment_orders")
      .select("id, plan, months, amount_tiyin, provider, status, paid_at, refunded_at, created_at")
      .eq("user_id", id)
      .order("created_at", { ascending: false }),
    c.from("premium_passes").select("test_id, week_start, created_at, tests(title)").eq("user_id", id).order("created_at", { ascending: false }),
    c.from("premium_trials").select("started_at, ends_at").eq("user_id", id).maybeSingle(),
    c.from("ultima_members").select("ultima_until, granted_at").eq("user_id", id).maybeSingle(),
    c
      .from("test_reports")
      .select("id, category, status, message, created_at, rewarded, tests(title)")
      .eq("user_id", id)
      .order("created_at", { ascending: false }),
    c.from("discipline_members").select("granted_at, strikes, reset_at").eq("user_id", id).maybeSingle(),
    c.from("reminder_log").select("kind, sent_day, status, error").eq("user_id", id).order("created_at", { ascending: false }).limit(50),
    c.from("student_bot_links").select("daily_on, linked_at").eq("user_id", id).maybeSingle(),
  ]);

  const now = Date.now();
  const title = (t: unknown) => {
    const o = Array.isArray(t) ? t[0] : t;
    return (o && typeof o === "object" && "title" in o ? String((o as { title: unknown }).title) : null) ?? "Deleted test";
  };

  type Raw = Record<string, unknown>;
  const st = (must("stats", statsR) ?? {}) as Raw;
  const correct = Number(st.total_correct) || 0;
  const questions = Number(st.total_questions) || 0;

  const trial = trialR.data as { started_at: string; ends_at: string } | null;
  const ult = ultimaR.data as { ultima_until: string; granted_at: string } | null;

  return {
    profile: p,
    membership: membershipStage(p.premium_until, now),
    ultima: ult ? { until: ult.ultima_until, granted_at: ult.granted_at, active: new Date(ult.ultima_until).getTime() > now } : null,
    trial: trial ? { ...trial, active: new Date(trial.ends_at).getTime() > now } : null,
    stats: {
      total_attempts: Number(st.total_attempts) || 0,
      reading_attempts: Number(st.reading_attempts) || 0,
      best_band: st.best_band == null ? null : Number(st.best_band),
      first_attempt_avg_band: st.first_attempt_avg_band == null ? null : Number(st.first_attempt_avg_band),
      accuracy: questions > 0 ? Math.round((correct / questions) * 100) : null,
    },
    results: (must<Raw[]>("results", resultsR)).map((r) => ({
      id: String(r.id),
      test_id: (r.test_id as string) ?? null,
      title: title(r.tests),
      skill: String(r.skill ?? ""),
      raw: r.raw as number | null,
      total: r.total as number | null,
      band: r.band == null ? null : Number(r.band),
      duration_seconds: r.duration_seconds as number | null,
      flagged: r.flagged as boolean | null,
      flag_reason: r.flag_reason as string | null,
      rated: r.rated as boolean | null,
      rating_delta: r.rating_delta as number | null,
      submitted_at: String(r.submitted_at),
    })),
    resultsTotal: resultsCountR.count ?? 0,
    mocks: (must<Raw[]>("mocks", mocksR)).map((m) => ({
      id: String(m.id),
      title: title(m.mocks),
      status: String(m.status),
      listening_band: m.listening_band as number | null,
      reading_band: m.reading_band as number | null,
      writing_band: m.writing_band as number | null,
      overall_band: m.overall_band as number | null,
      submitted_at: m.submitted_at as string | null,
      released_at: m.released_at as string | null,
      created_at: String(m.created_at),
    })),
    writing: must("writing", writingR) as S360["writing"],
    speaking: must("speaking", speakingR) as S360["speaking"],
    orders: (must<Raw[]>("orders", ordersR)).map((o) => ({
      id: String(o.id),
      plan: String(o.plan ?? "premium"),
      months: Number(o.months),
      amount: Math.round(Number(o.amount_tiyin) / 100),
      provider: String(o.provider),
      status: String(o.status),
      paid_at: o.paid_at as string | null,
      refunded_at: o.refunded_at as string | null,
      created_at: String(o.created_at),
    })),
    passes: (must<Raw[]>("passes", passesR)).map((x) => ({
      test_id: String(x.test_id),
      title: title(x.tests),
      week_start: String(x.week_start),
      created_at: String(x.created_at),
    })),
    reports: (must<Raw[]>("reports", reportsR)).map((x) => ({
      id: String(x.id),
      title: title(x.tests),
      category: String(x.category),
      status: String(x.status),
      message: String(x.message ?? ""),
      created_at: String(x.created_at),
      rewarded: Boolean(x.rewarded),
    })),
    discipline: (disciplineR.data as S360["discipline"]) ?? null,
    emails: must("emails", emailsR) as S360["emails"],
    bot: (botR.data as S360["bot"]) ?? null,
    activityDates: (must<Raw[]>("dates", datesR)).map((r) => String(r.submitted_at)),
  };
}

/** The live streak, the same rule the student sees. */
export function liveStreakOf(p: S360["profile"]): number {
  return liveStreak(p.streak, p.last_activity_date, p.timezone ?? "UTC");
}
