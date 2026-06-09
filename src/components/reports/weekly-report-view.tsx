import Link from "next/link";
import {
  BookOpen,
  Target,
  Gauge,
  Flame,
  Award,
  TrendingUp,
  TrendingDown,
  Minus,
  Trophy,
  ArrowRight,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { TierChip } from "@/components/rating/rank-badge";
import type { WeeklyReport } from "@/types/database";

function fmtRange(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${s.toLocaleDateString(undefined, opts)} – ${e.toLocaleDateString(undefined, {
    ...opts,
    year: "numeric",
  })}`;
}

export function WeeklyReportView({ report }: { report: WeeklyReport }) {
  const r = report;
  const noActivity = r.tests_completed === 0;

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-brand-gradient p-6 text-white shadow-elevated">
        <div className="ring-hairline absolute inset-0 rounded-2xl" />
        <div className="relative">
          <p className="text-sm font-medium text-white/85">Weekly progress report</p>
          <h1 className="mt-1 text-2xl font-bold">{fmtRange(r.period_start, r.period_end)}</h1>
          <p className="mt-2 text-sm text-white/80">
            {noActivity ? (
              <>No tests this week — jump back in to keep your streak and rating moving.</>
            ) : (
              <>
                You completed <strong>{r.tests_completed}</strong> test
                {r.tests_completed === 1 ? "" : "s"}
                {r.avg_band != null && <> with an average band of <strong>{r.avg_band}</strong></>}.
              </>
            )}
          </p>
          {r.generated_by === "admin" && (
            <span className="mt-3 inline-block rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-medium">
              Sent by an admin
            </span>
          )}
        </div>
      </div>

      {/* Stat grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Stat icon={<BookOpen />} label="Tests completed" value={`${r.tests_completed}`} />
        <Stat
          icon={<Target />}
          label="Average band"
          value={r.avg_band != null ? r.avg_band.toFixed(1) : "—"}
        />
        <Stat
          icon={<Trophy />}
          label="Best band"
          value={r.best_band != null ? r.best_band.toFixed(1) : "—"}
        />
        <Stat
          icon={<Gauge />}
          label="Accuracy"
          value={r.avg_accuracy != null ? `${r.avg_accuracy}%` : "—"}
        />
        <Stat icon={<Flame />} label="Streak" value={`${r.streak} 🔥`} />
        <Stat icon={<Award />} label="New achievements" value={`${r.new_achievements}`} />
      </div>

      {/* Rating movement */}
      <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-muted">Rating this week</p>
          <p className="mt-1 flex items-center gap-2 text-2xl font-bold tabular-nums">
            {r.rating_start ?? "—"} <ArrowRight className="h-4 w-4 text-muted" /> {r.rating_end ?? "—"}
            {r.rating_end != null && <TierChip rating={r.rating_end} className="ml-1" />}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <RatingDelta delta={r.rating_delta} />
          {r.points > 0 && (
            <div className="text-right">
              <p className="text-2xl font-bold tabular-nums text-primary">+{r.points}</p>
              <p className="text-xs text-muted">league points</p>
            </div>
          )}
        </div>
      </Card>

      {/* CTAs */}
      <div className="flex flex-wrap gap-3">
        <Link
          href="/reading"
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-soft hover:opacity-90"
        >
          <BookOpen className="h-4 w-4" /> Practise reading
        </Link>
        <Link
          href="/leaderboard"
          className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold hover:bg-surface-2"
        >
          <Trophy className="h-4 w-4" /> View leaderboard
        </Link>
        <Link
          href="/reports"
          className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold hover:bg-surface-2"
        >
          Past reports
        </Link>
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="flex flex-col justify-center">
      <div className="flex items-center gap-2 text-muted">
        <span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span>
        <span className="text-xs">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
    </Card>
  );
}

function RatingDelta({ delta }: { delta: number }) {
  const cls = delta > 0 ? "text-success" : delta < 0 ? "text-danger" : "text-muted";
  const Icon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  return (
    <div className="text-right">
      <p className={`flex items-center gap-1 text-2xl font-bold tabular-nums ${cls}`}>
        <Icon className="h-5 w-5" />
        {delta > 0 ? `+${delta}` : delta}
      </p>
      <p className="text-xs text-muted">rating change</p>
    </div>
  );
}
