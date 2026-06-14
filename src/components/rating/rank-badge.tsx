import { tierForRating, type Tier } from "@/lib/rating";
import { cn } from "@/lib/utils";

const SIZES = {
  sm: { box: "h-8 w-8 text-xs", ring: "ring-1" },
  md: { box: "h-12 w-12 text-base", ring: "ring-2" },
  lg: { box: "h-20 w-20 text-2xl", ring: "ring-4" },
} as const;

/**
 * The tier emblem — a solid warm tile carrying the tier monogram.
 * Pass either a `rating` or an explicit `tier`.
 */
export function RankBadge({
  rating,
  tier,
  size = "md",
  className,
}: {
  rating?: number;
  tier?: Tier;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const t = tier ?? tierForRating(rating ?? 0);
  const s = SIZES[size];
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-xl font-bold shadow-soft ring-black/5",
        t.gradient,
        s.box,
        s.ring,
        className,
      )}
      title={t.label}
      aria-label={t.label}
    >
      {t.emoji}
    </span>
  );
}

/** A compact "Gold II" pill with the metal's accent colour. */
export function TierChip({ rating, className }: { rating: number; className?: string }) {
  const t = tierForRating(rating);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold",
        t.accent,
        className,
      )}
    >
      {t.label}
    </span>
  );
}
