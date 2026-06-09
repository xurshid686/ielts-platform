import Link from "next/link";
import {
  Flame,
  Trophy,
  Zap,
  CheckCircle2,
  BookOpen,
  Headphones,
  PenLine,
  Mic,
  ArrowRight,
  Target,
  Gauge,
  CalendarDays,
  Lightbulb,
  TrendingUp,
  TrendingDown,
  Award,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { avg, timeAgo } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { ProgressTrends, type BandPoint } from "@/components/dashboard/progress-trends";
import { ActivityHeatmap } from "@/components/dashboard/activity-heatmap";
import { CriteriaBars } from "@/components/dashboard/criteria-bars";
import { computeBadges } from "@/lib/badges";
import { GoalTracker, type GoalSkill } from "@/components/dashboard/goal-tracker";
import { RatingCard } from "@/components/rating/rating-card";
import type { Result, SpeakingSubmission, LeaderboardGlobalRow } from "@/types/database";

type Activity = {
  id: string;
  skill: string;
  band: number | null;
  raw: number | null;
  total: number | null;
  at: string;
};

// Round to the nearest half band, the IELTS way (e.g. 6.25 → 6.5, 6.75 → 7.0).
function roundHalf(n: number) {
  return Math.round(n * 2) / 2;
}

export default async function DashboardPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  // Reading / listening / writing live in `results`; speaking lives in `speaking_submissions`.
  const [{ data: results }, { data: speaking }, { data: rankRow }] = await Promise.all([
    supabase
      .from("results")
      .select("*")
      .eq("user_id", profile.id)
      .order("submitted_at", { ascending: false }),
    supabase
      .from("speaking_submissions")
      .select("id, score, created_at, feedback")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false }),
    supabase.from("leaderboard_global").select("rank").eq("id", profile.id).maybeSingle(),
  ]);

  const globalRank = (rankRow as Pick<LeaderboardGlobalRow, "rank"> | null)?.rank ?? null;

  const all = (results ?? []) as Result[];
  const speak = (speaking ?? []) as Pick<
    SpeakingSubmission,
    "id" | "score" | "created_at" | "feedback"
  >[];

  // ---- Per-skill aggregates -------------------------------------------------
  const bands = (skill: string) =>
    all.filter((r) => r.skill === skill && r.band != null).map((r) => Number(r.band));

  const speakingBands = speak.filter((s) => s.score != null).map((s) => Number(s.score));

  const readingAvg = avg(bands("reading"));
  const listeningAvg = avg(bands("listening"));
  const writingAvg = avg(bands("writing"));
  const speakingAvg = avg(speakingBands);

  const best = (xs: number[]) => (xs.length ? Math.max(...xs) : null);

  // Chronological band series per skill (oldest first), capped to the last 12.
  const seriesFor = (skill: string): BandPoint[] =>
    all
      .filter((r) => r.skill === skill && r.band != null)
      .slice(0, 12)
      .reverse()
      .map((r) => ({ band: Number(r.band), at: r.submitted_at }));

  const speakingSeries: BandPoint[] = speak
    .filter((s) => s.score != null)
    .slice(0, 12)
    .reverse()
    .map((s) => ({ band: Number(s.score), at: s.created_at }));

  const series: Record<string, BandPoint[]> = {
    reading: seriesFor("reading"),
    listening: seriesFor("listening"),
    writing: seriesFor("writing"),
    speaking: speakingSeries,
  };

  const delta = (xs: BandPoint[]) =>
    xs.length >= 2 ? +(xs[xs.length - 1].band - xs[xs.length - 2].band).toFixed(1) : null;

  // Accuracy (raw/total) for the auto-graded skills.
  const accuracy = (skill: string) => {
    const rows = all.filter(
      (r) => r.skill === skill && r.raw != null && r.total != null && r.total > 0,
    );
    if (!rows.length) return null;
    const got = rows.reduce((a, r) => a + (r.raw as number), 0);
    const max = rows.reduce((a, r) => a + (r.total as number), 0);
    return Math.round((got / max) * 100);
  };

  const skillStats = [
    {
      key: "reading",
      href: "/reading",
      icon: <BookOpen className="h-5 w-5" />,
      title: "Reading",
      avg: readingAvg,
      best: best(bands("reading")),
      count: bands("reading").length,
      delta: delta(series.reading),
      accuracy: accuracy("reading"),
    },
    {
      key: "listening",
      href: "/listening",
      icon: <Headphones className="h-5 w-5" />,
      title: "Listening",
      avg: listeningAvg,
      best: best(bands("listening")),
      count: bands("listening").length,
      delta: delta(series.listening),
      accuracy: accuracy("listening"),
    },
    {
      key: "speaking",
      href: "/speaking",
      icon: <Mic className="h-5 w-5" />,
      title: "Speaking",
      avg: speakingAvg,
      best: best(speakingBands),
      count: speak.length,
      delta: delta(series.speaking),
      accuracy: null,
    },
    {
      key: "writing",
      href: "/writing",
      icon: <PenLine className="h-5 w-5" />,
      title: "Writing",
      avg: writingAvg,
      best: best(bands("writing")),
      count: bands("writing").length,
      delta: delta(series.writing),
      accuracy: null,
    },
  ];

  // ---- Estimated overall band (mean of available skill averages) -----------
  const skillAverages = [readingAvg, listeningAvg, speakingAvg, writingAvg].filter(
    (n): n is number => n != null,
  );
  const overall =
    skillAverages.length > 0
      ? roundHalf(skillAverages.reduce((a, b) => a + b, 0) / skillAverages.length)
      : null;

  // ---- Strongest / weakest skill -------------------------------------------
  const ranked = skillStats
    .filter((s) => s.avg != null)
    .sort((a, b) => (b.avg as number) - (a.avg as number));
  const strongest = ranked[0];
  const weakest = ranked[ranked.length - 1];

  // Goal tracker: per-skill averages for the study plan.
  const goalSkills: GoalSkill[] = skillStats.map((s) => ({
    key: s.key,
    title: s.title,
    href: s.href,
    avg: s.avg,
  }));

  // ---- This week vs last week ----------------------------------------------
  const allDates = [...all.map((r) => r.submitted_at), ...speak.map((s) => s.created_at)];
  const now = Date.now();
  const WEEK = 7 * 86_400_000;
  const inRange = (iso: string, from: number, to: number) => {
    const t = new Date(iso).getTime();
    return t >= from && t < to;
  };
  const thisWeek = allDates.filter((d) => inRange(d, now - WEEK, now + 1)).length;
  const lastWeek = allDates.filter((d) => inRange(d, now - 2 * WEEK, now - WEEK)).length;
  const weekDelta = thisWeek - lastWeek;

  const totalCompleted = all.length + speak.length;

  // ---- Badges ---------------------------------------------------------------
  const badges = computeBadges({
    streak: profile.streak,
    longestStreak: profile.longest_streak,
    xp: profile.xp,
    results: all,
    speaking: speak,
  });
  const earnedBadges = badges.filter((b) => b.earned);
  const showcaseBadges = [...earnedBadges]
    .sort((a, b) => +new Date(b.earnedAt ?? 0) - +new Date(a.earnedAt ?? 0))
    .slice(0, 8);

  // ---- Speaking criteria averages (from stored Gemini feedback) ------------
  const critKeys = [
    ["fluency", "Fluency & Coherence"],
    ["lexical", "Lexical Resource"],
    ["grammar", "Grammar"],
    ["pronunciation", "Pronunciation"],
  ] as const;
  const criteria = critKeys.map(([k, label]) => {
    const vals = speak
      .map((s) => s.feedback?.criteria?.[k]?.band)
      .filter((n): n is number => typeof n === "number");
    return { label, band: avg(vals) };
  });

  // ---- Unified recent activity ---------------------------------------------
  const activity: Activity[] = [
    ...all.map((r) => ({
      id: r.id,
      skill: r.skill,
      band: r.band != null ? Number(r.band) : null,
      raw: r.raw,
      total: r.total,
      at: r.submitted_at,
    })),
    ...speak.map((s) => ({
      id: s.id,
      skill: "speaking",
      band: s.score != null ? Number(s.score) : null,
      raw: null,
      total: null,
      at: s.created_at,
    })),
  ]
    .sort((a, b) => +new Date(b.at) - +new Date(a.at))
    .slice(0, 8);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Hi {profile.name?.split(" ")[0] || "there"} 👋
        </h1>
        <p className="text-muted">Here&apos;s your progress. Keep the streak alive!</p>
      </div>

      {/* Streak hero + overall band + key stats */}
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="relative overflow-hidden rounded-2xl bg-brand-gradient p-6 text-white shadow-elevated">
          <div className="ring-hairline absolute inset-0 rounded-2xl" />
          <div className="relative flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-white/85">
                <Flame className="h-4 w-4" /> Current streak
              </div>
              <p className="mt-2 flex items-end gap-2 text-5xl font-extrabold tabular-nums">
                {profile.streak}
                <span className="mb-1 text-2xl">🔥</span>
              </p>
              <p className="mt-1 text-sm text-white/80">
                {profile.streak > 0
                  ? "Come back tomorrow to keep it going."
                  : "Take a test today to start your streak."}
              </p>
              <div className="mt-5 flex gap-6 text-sm">
                <span className="flex items-center gap-1.5 text-white/90">
                  <Trophy className="h-4 w-4" /> Best{" "}
                  <strong className="tabular-nums">{profile.longest_streak}</strong>
                </span>
                <span className="flex items-center gap-1.5 text-white/90">
                  <Zap className="h-4 w-4" /> <strong className="tabular-nums">{profile.xp}</strong> XP
                </span>
              </div>
            </div>

            {/* Estimated overall band */}
            <div className="flex flex-col items-center rounded-2xl bg-white/12 px-5 py-4 text-center backdrop-blur-sm">
              <span className="text-[11px] font-medium uppercase tracking-wide text-white/80">
                Est. overall
              </span>
              <span className="mt-1 text-4xl font-extrabold tabular-nums">
                {overall != null ? overall.toFixed(1) : "—"}
              </span>
              <span className="text-[11px] text-white/70">{skillAverages.length}/4 skills</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Stat icon={<Trophy className="text-warning" />} label="Longest streak" value={`${profile.longest_streak}`} />
          <Stat icon={<Zap className="text-primary" />} label="XP points" value={`${profile.xp}`} />
          <Stat icon={<CheckCircle2 className="text-success" />} label="Completed" value={`${totalCompleted}`} />
          <Stat
            icon={<CalendarDays className="text-accent" />}
            label="This week"
            value={`${thisWeek}`}
            hint={
              weekDelta !== 0 ? (
                <span
                  className={`inline-flex items-center gap-0.5 ${weekDelta > 0 ? "text-success" : "text-danger"}`}
                >
                  {weekDelta > 0 ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  {Math.abs(weekDelta)} vs last
                </span>
              ) : null
            }
          />
        </div>
      </div>

      {/* Competitive reading rating (defaults guard the pre-migration window) */}
      <RatingCard
        rating={profile.rating ?? 1000}
        peak={profile.peak_rating ?? 1000}
        ratedCount={profile.rated_count ?? 0}
        globalRank={globalRank}
      />

      {/* Goal tracker + study plan */}
      <GoalTracker target={profile.target_band} overall={overall} skills={goalSkills} />

      {/* Insights (only when no goal is set — the tracker covers "focus next" otherwise) */}
      {profile.target_band == null && strongest && weakest && (
        <Card className="flex items-start gap-3 border-primary/30 bg-primary/5">
          <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <p className="text-sm">
            {strongest.key === weakest.key ? (
              <>
                Your strongest skill so far is <strong>{strongest.title}</strong> (Band{" "}
                {strongest.avg}). Add the other skills to see a full picture and an estimated
                overall band.
              </>
            ) : (
              <>
                <strong>{strongest.title}</strong> is your strongest skill (Band {strongest.avg}).
                Focus on <strong>{weakest.title}</strong> (Band {weakest.avg}) to lift your overall
                band the fastest.{" "}
                <Link href={weakest.href} className="font-medium text-primary hover:underline">
                  Practise {weakest.title} →
                </Link>
              </>
            )}
          </p>
        </Card>
      )}

      {/* Skill overview — richer cards */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Skill progress</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {skillStats.map(({ key, ...s }) => (
            <SkillCard key={key} {...s} />
          ))}
        </div>
      </section>

      {/* Badges showcase */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Badges</h2>
          <Link
            href="/badges"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            View all <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <Link href="/badges">
          <Card interactive className="flex flex-wrap items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Award className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold tabular-nums">
                {earnedBadges.length}
                <span className="font-medium text-muted"> / {badges.length} earned</span>
              </p>
              {showcaseBadges.length > 0 ? (
                <div className="mt-1 flex flex-wrap gap-1.5 text-2xl">
                  {showcaseBadges.map((b) => (
                    <span key={b.def.id} title={`${b.def.name} — ${b.def.description}`}>
                      {b.def.emoji}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-0.5 text-sm text-muted">
                  Complete your first test to earn a badge.
                </p>
              )}
            </div>
          </Card>
        </Link>
      </section>

      {/* Trend + activity heatmap */}
      <section className="grid gap-4 lg:grid-cols-2">
        <ProgressTrends series={series} />
        <ActivityHeatmap dates={allDates} />
      </section>

      {/* Speaking breakdown + recent activity */}
      <section className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <CriteriaBars criteria={criteria} />

        <Card className="overflow-hidden p-0">
          <div className="flex items-center justify-between px-5 py-3.5">
            <h3 className="text-sm font-medium text-muted">Recent activity</h3>
            <span className="text-xs text-muted tabular-nums">{totalCompleted} total</span>
          </div>
          {activity.length === 0 ? (
            <div className="border-t border-border p-8 text-center text-muted">
              No activity yet.{" "}
              <Link href="/reading" className="font-medium text-primary hover:underline">
                Take your first test →
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-border border-t border-border">
              {activity.map((a) => {
                const reviewable = a.skill === "reading" || a.skill === "listening";
                const inner = (
                  <>
                    <div className="flex items-center gap-3">
                      <SkillDot skill={a.skill} />
                      <div>
                        <p className="text-sm font-medium capitalize">{a.skill}</p>
                        <p className="text-xs text-muted">{timeAgo(a.at)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        {a.band != null && (
                          <p className="font-semibold tabular-nums">Band {a.band}</p>
                        )}
                        {a.raw != null && a.total != null && (
                          <p className="text-xs text-muted tabular-nums">
                            {a.raw}/{a.total}
                          </p>
                        )}
                      </div>
                      {reviewable && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                          Review
                          <ArrowRight className="h-3.5 w-3.5" />
                        </span>
                      )}
                    </div>
                  </>
                );
                return (
                  <li key={a.id}>
                    {reviewable ? (
                      <Link
                        href={`/review/${a.id}`}
                        className="flex items-center justify-between px-5 py-3 transition-colors hover:bg-surface-2/60"
                      >
                        {inner}
                      </Link>
                    ) : (
                      <div className="flex items-center justify-between px-5 py-3">{inner}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col justify-center">
      <div className="flex items-center gap-2 text-muted">
        <span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span>
        <span className="text-sm">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs font-medium">{hint}</p>}
    </Card>
  );
}

function SkillCard({
  href,
  icon,
  title,
  avg: avgBand,
  best,
  count,
  delta,
  accuracy,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  avg: number | null;
  best: number | null;
  count: number;
  delta: number | null;
  accuracy: number | null;
}) {
  return (
    <Link href={href} className="group">
      <Card interactive className="h-full">
        <div className="flex items-center justify-between">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
            {icon}
          </div>
          {delta != null && delta !== 0 ? (
            <span
              className={`inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums ${
                delta > 0 ? "text-success" : "text-danger"
              }`}
            >
              {delta > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {delta > 0 ? `+${delta}` : delta}
            </span>
          ) : (
            <ArrowRight className="h-4 w-4 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
          )}
        </div>
        <h3 className="mt-3 font-semibold">{title}</h3>
        <p className="text-lg font-bold tabular-nums">
          {title === "Writing" && count === 0 ? (
            <span className="text-sm font-medium text-muted">Coming soon</span>
          ) : avgBand != null ? (
            `Band ${avgBand}`
          ) : (
            <span className="text-sm font-medium text-muted">No tests yet</span>
          )}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
          <span className="inline-flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" /> {count} {count === 1 ? "test" : "tests"}
          </span>
          {best != null && (
            <span className="inline-flex items-center gap-1">
              <Target className="h-3 w-3" /> Best {best}
            </span>
          )}
          {accuracy != null && (
            <span className="inline-flex items-center gap-1">
              <Gauge className="h-3 w-3" /> {accuracy}%
            </span>
          )}
        </div>
      </Card>
    </Link>
  );
}

function SkillDot({ skill }: { skill: string }) {
  const map: Record<string, string> = {
    reading: "bg-indigo-500",
    listening: "bg-teal-500",
    writing: "bg-amber-500",
    speaking: "bg-rose-500",
  };
  return <span className={`h-2.5 w-2.5 rounded-full ${map[skill] ?? "bg-slate-400"}`} />;
}
