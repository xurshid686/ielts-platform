import { tierForRating, type Tier } from "@/lib/rating";
import { cn } from "@/lib/utils";

const SIZES = {
  sm: "h-8 w-8",
  md: "h-12 w-12",
  lg: "h-20 w-20",
} as const;

// A shield in a 48x48 box, and the same outline drawn 3 units inside it.
const SHIELD = "M24 3 42 9v15c0 10-8 17-18 21C14 41 6 34 6 24V9Z";
const INNER = "M24 6.6 38.6 11.4V24c0 8.2-6.4 14-14.6 17.5C15.8 38 9.4 32.2 9.4 24V11.4Z";
// A five-pointed star centred on (24, 35.5), for the two tiers with no division.
const STAR =
  "M24 31.6l1.15 2.5 2.75.3-2.05 1.85.6 2.7L24 37.55l-2.45 1.4.6-2.7-2.05-1.85 2.75-.3Z";

const PIPS: Record<Tier["division"], number> = { I: 1, II: 2, III: 3, "": 0 };

/**
 * The tier emblem: one shield, eight fills, and three things that tell tiers
 * apart without relying on colour — the monogram, the division pips under it
 * (one, two or three), and a star in place of pips on the two top tiers,
 * which have no divisions.
 *
 * Colours come from the --tier-* tokens through `Tier.fill` / `Tier.ink`.
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
  const pips = PIPS[t.division];
  const wide = t.monogram.length > 1;
  // Pips are 5 units apart, centred on x = 24.
  const firstPip = 24 - ((pips - 1) * 5) / 2;

  return (
    <span
      className={cn("relative inline-flex shrink-0 drop-shadow-sm", SIZES[size], className)}
      title={t.label}
      role="img"
      aria-label={t.label}
    >
      <svg viewBox="0 0 48 48" className="h-full w-full" aria-hidden>
        <path d={SHIELD} fill={t.fill} />
        <path d={INNER} fill="none" stroke={t.ink} strokeOpacity={0.3} strokeWidth={1} />
        <text
          x={24}
          y={pips || !t.division ? 25.5 : 27}
          textAnchor="middle"
          fill={t.ink}
          fontSize={wide ? 13 : 17}
          fontWeight={800}
          style={{ fontFamily: "var(--font-display), var(--font-sans), sans-serif" }}
        >
          {t.monogram}
        </text>
        {pips > 0 ? (
          Array.from({ length: pips }, (_, i) => (
            <circle key={i} cx={firstPip + i * 5} cy={34} r={1.7} fill={t.ink} />
          ))
        ) : (
          <path d={STAR} fill={t.ink} />
        )}
      </svg>
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
