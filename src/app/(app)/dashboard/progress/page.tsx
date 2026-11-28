import Link from "next/link";
import {
  Trophy,
  Zap,
  CheckCircle2,
  BookOpen,
  Headphones,
  PenLine,
  ArrowRight,
  Target,
  Gauge,
  CalendarDays,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { avg, weeklyActivity } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { ProgressTrends, type BandPoint } from "@/components/dashboard/progress-trends";
import { ActivityHeatmap } from "@/components/dashboard/activity-heatmap";
import { GoalTracker, type GoalSkill } from "@/components/dashboard/goal-tracker";
import { WritingReportsCard } from "@/components/dashboard/writing-reports-card";
import { RatingCard } from "@/components/rating/rating-card";
import { RatingTrend, type RatingPoint } from "@/components/dashboard/rating-trend";
import { FocusArea, type RecommendedTest } from "@/components/dashboard/focus-area";
import { SkillRatingsCard } from "@/components/rating/skill-ratings-card";
import { DashboardTabs } from "@/components/dashboard/dashboard-tabs";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { computeTypeStats, weakestType } from "@/lib/analytics";
import { recommendOpenable } from "@/lib/today-pick";
import { estimatedOverall, skillSnapshot } from "@/lib/dashboard-shared";
import { loadDashboard } from "@/lib/dashboard-data";
import { headlineBand } from "@/lib/writing-ai-shared";
import { skillRatingsOf } from "@/lib/skill-ratings";
import type { LeaderboardGlobalRow } from "@/types/database";

// The analytical half of the student dashboard: everything the old one-page dashboard
// showed, moved here when /dashboard became "Today" (owner, 2026-11-28). Nothing was
// deleted except Speaking (not sold): its skill card, trend series and criteria bars.

export const metadata: Metadata = { title: "Your progress" };

export default async function ProgressPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const [d, rankRes, skillRatings] = await Promise.all([
    loadDashboard(profile),
    // Rank views scan every profile: Progress only, never on Today.
    supabase.from("leaderboard_global").select("rank").eq("id", profile.id).maybeSingle(),
    skillRatingsOf(profile.id).catch(() => null),
  ]);
  const globalRank = (rankRes.data as Pick<LeaderboardGlobalRow, "rank"> | null)?.rank ?? null;
  const all = d.results;

  // ---- Per-skill aggregates (R / L / W) ----------------------------------
  const bands = (skill: string) => all.filter((r) => r.skill === skill && r.band != null).map((r) => Number(r.band));
  const best = (xs: number[]) => (xs.length ? Math.max(...xs) : null);
  const seriesFor = (skill: string): BandPoint[] =>
    all
      .filter((r) => r.skill === skill && r.band != null)
      .slice(0, 12)
      .reverse()
      .map((r) => ({ band: Number(r.band), at: r.submitted_at }));

  // Writing practice is scored by the AI checks, not `results`: draw those as Writing's series.
  const writingSeries: BandPoint[] = d.reports
    .slice(0, 12)
    .reverse()
    .map((r) => ({ at: r.at, band: headlineBand(r.results) }))
    .filter((p): p is BandPoint => p.band != null);
  const series: Record<string, BandPoint[]> = {
    reading: seriesFor("reading"),
    listening: seriesFor("listening"),
    writing: writingSeries.length ? writingSeries : seriesFor("writing"),
  };
  const delta = (xs: BandPoint[]) => (xs.length >= 2 ? +(xs[xs.length - 1].band - xs[xs.length - 2].band).toFixed(1) : null);
  const accuracy = (skill: string) => {
    const rs = all.filter((r) => r.skill === skill && r.raw != null && r.total != null && r.total > 0);
    if (!rs.length) return null;
    const got = rs.reduce((a, r) => a + (r.raw as number), 0);
    const max = rs.reduce((a, r) => a + (r.total as number), 0);
    return Math.round((got / max) * 100);
  };
  const writingBands = series.writing.map((p) => p.band);

  const skillStats = [
    {
      key: "reading",
      href: "/reading",
      icon: <BookOpen className="h-5 w-5" />,
      title: "Reading",
      avg: avg(bands("reading")),
      best: best(bands("reading")),
      count: bands("reading").length,
      unit: "test",
      delta: delta(series.reading),
      accuracy: accuracy("reading"),
    },
    {
      key: "listening",
      href: "/listening",
      icon: <Headphones className="h-5 w-5" />,
      title: "Listening",
      avg: avg(bands("listening")),
      best: best(bands("listening")),
      count: bands("listening").length,
      unit: "test",
      delta: delta(series.listening),
      accuracy: accuracy("listening"),
    },
    {
      key: "writing",
      href: "/writing",
      icon: <PenLine className="h-5 w-5" />,
      title: "Writing",
      avg: avg(writingBands),
      best: best(writingBands),
      count: writingBands.length,
      unit: "essay",
      delta: delta(series.writing),
      accuracy: null,
    },
  ];

  const snap = skillSnapshot(all, d.writingBand);
  const overall = estimatedOverall(snap).band;
  const goalSkills: GoalSkill[] = skillStats.map((s) => ({ key: s.key, title: s.title, href: s.href, avg: s.avg }));

  const allDates = [...all.map((r) => r.submitted_at), ...d.reports.map((r) => r.at)];
  const { thisWeek, lastWeek } = weeklyActivity(allDates);
  const weekDelta = thisWeek - lastWeek;
  const totalCompleted = all.length + d.reports.length;

  // ---- Question types + passes-aware recommendations -----------------------
  const typeStats = computeTypeStats(all, d.catalogue, "reading");
  const weakQType = weakestType(typeStats);
  const recommended: RecommendedTest[] = recommendOpenable(d.pickInput).map((t) => ({
    id: t.id,
    title: t.title,
    kind: t.kind ?? "single",
    passage: t.passage,
    difficulty: t.difficulty ?? 1500,
  }));

  const ratingPoints: RatingPoint[] = all
    .filter((r) => r.skill === "reading" && r.rated && r.rating_after != null)
    .slice()
    .reverse()
    .map((r) => ({ rating: r.rating_after as number, at: r.submitted_at }));

  const titles = new Map(d.catalogue.map((t) => [t.id, t.title]));
  const activity = all.slice(0, 15).map((r) => ({
    id: r.id,
    skill: r.skill,
    title: r.test_id ? (titles.get(r.test_id) ?? null) : null,
    band: r.band != null ? Number(r.band) : null,
    raw: r.raw,
    total: r.total,
    at: r.submitted_at,
  }));

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Your progress</h1>
          <p className="mt-1.5 text-muted">Bands, ratings and the question types to work on.</p>
        </div>
        <DashboardTabs active="progress" />
      </header>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat icon={<Trophy className="text-warning" />} label="Longest streak" value={`${profile.longest_streak}`} />
        <Stat icon={<Zap className="text-primary" />} label="XP points" value={`${profile.xp}`} />
        <Stat icon={<CheckCircle2 className="text-success" />} label="Completed" value={`${totalCompleted}`} />
        <Stat
          icon={<CalendarDays className="text-accent" />}
          label="This week"
          value={`${thisWeek}`}
          hint={
            weekDelta !== 0 ? (
              <span className={`inline-flex items-center gap-0.5 ${weekDelta > 0 ? "text-success" : "text-danger"}`}>
                {weekDelta > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {Math.abs(weekDelta)} vs last
              </span>
            ) : null
          }
        />
      </div>

      <div id="goal" className="scroll-mt-20">
        <GoalTracker target={profile.target_band} overall={overall} skills={goalSkills} />
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Skills</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {skillStats.map(({ key, ...s }) => (
            <SkillCard key={key} {...s} />
          ))}
        </div>
      </section>

      <RatingCard
        rating={profile.rating ?? 1000}
        peak={profile.peak_rating ?? 1000}
        ratedCount={profile.rated_count ?? 0}
        globalRank={globalRank}
      />
      {skillRatings && <SkillRatingsCard data={skillRatings} />}

      <section>
        <h2 className="mb-3 text-lg font-semibold">What to practise next</h2>
        <FocusArea stats={typeStats} weakest={weakQType} recommended={recommended} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <ProgressTrends series={series} />
        <RatingTrend points={ratingPoints} />
      </section>

      <WritingReportsCard reports={d.reports} />

      <ActivityHeatmap dates={allDates} />

      <RecentActivity items={activity} total={totalCompleted} />
    </div>
  );
}

function Stat({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: React.ReactNode }) {
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
  unit,
  delta,
  accuracy,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  avg: number | null;
  best: number | null;
  count: number;
  unit: string;
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
            <span className={`inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums ${delta > 0 ? "text-success" : "text-danger"}`}>
              {delta > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {delta > 0 ? `+${delta}` : delta}
            </span>
          ) : (
            <ArrowRight className="h-4 w-4 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
          )}
        </div>
        <h3 className="mt-3 font-semibold">{title}</h3>
        <p className="text-lg font-bold tabular-nums">
          {avgBand != null ? `Band ${avgBand}` : <span className="text-sm font-medium text-muted">Nothing yet</span>}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
          <span className="inline-flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" /> {count} {count === 1 ? unit : `${unit}s`}
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
