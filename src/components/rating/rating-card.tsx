import Link from "next/link";
import { Trophy, ArrowRight, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { RankBadge } from "@/components/rating/rank-badge";
import { ratingProgress, estimatedBand } from "@/lib/rating";

/**
 * The headline rating widget for the dashboard: current tier, rating, a
 * progress bar to the next division, and the "X points to <metal>" nudge.
 */
export function RatingCard({
  rating,
  peak,
  ratedCount,
  globalRank,
}: {
  rating: number;
  peak: number;
  ratedCount: number;
  globalRank?: number | null;
}) {
  const p = ratingProgress(rating);
  const provisional = ratedCount < 5;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start gap-4">
        <RankBadge rating={rating} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-muted">Reading rating</p>
            <Link
              href="/leaderboard"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              Leaderboard <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <p className="flex items-end gap-2 leading-none">
            <span className="text-4xl font-extrabold tabular-nums">{rating}</span>
            <span className="mb-0.5 text-sm font-semibold text-muted">{p.tier.label}</span>
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
            <span className="inline-flex items-center gap-1">
              <Trophy className="h-3 w-3" /> Peak {peak}
            </span>
            {globalRank != null && (
              <span className="inline-flex items-center gap-1">
                <Sparkles className="h-3 w-3" /> Global #{globalRank}
              </span>
            )}
            <span>≈ Band {estimatedBand(rating)}</span>
          </div>
        </div>
      </div>

      {/* Progress to the next division */}
      {p.next ? (
        <div>
          <div className="mb-1 flex items-center justify-between text-xs font-medium">
            <span className="text-muted">{p.tier.label}</span>
            <span className="text-muted">{p.next.label}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-surface-2">
            <div
              className={`h-full rounded-full bg-gradient-to-r ${p.next.gradient}`}
              style={{ width: `${p.pct}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-muted">
            {provisional ? (
              <>
                Provisional — finish {5 - ratedCount} more rated test
                {5 - ratedCount === 1 ? "" : "s"} to lock in your rank.
              </>
            ) : p.nextMetal ? (
              <>
                You need <strong className="text-foreground">{p.toNextMetal}</strong> rating point
                {p.toNextMetal === 1 ? "" : "s"} to reach{" "}
                <strong className={p.nextMetal.accent}>{p.nextMetal.name}</strong>.
              </>
            ) : (
              <>
                <strong className="text-foreground">{p.toNext}</strong> points to {p.next.label}.
              </>
            )}
          </p>
        </div>
      ) : (
        <p className="text-xs font-medium text-rose-500">
          🌟 Legend tier — you&apos;ve reached the very top.
        </p>
      )}
    </Card>
  );
}
