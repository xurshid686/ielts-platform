// Reading rating system — tiers, Elo maths, and progress helpers.
//
// ⚠️ The authoritative rating computation lives in the database
// (public.apply_rating in supabase/migrations/0016_ranking.sql). The functions
// here are a faithful MIRROR used only for client display and unit tests — a
// student can never move their own rating through this code (RLS + the 0014
// trigger block direct writes; only the SECURITY DEFINER SQL function can).

export type TierName =
  | "Bronze"
  | "Silver"
  | "Gold"
  | "Platinum"
  | "Diamond"
  | "Master"
  | "Grandmaster"
  | "Legend";

export type Tier = {
  /** Lower bound (inclusive) of this division. */
  floor: number;
  name: TierName;
  /** Roman division within the metal, or "" for single-band tiers. */
  division: "I" | "II" | "III" | "";
  /** "Gold II" etc. */
  label: string;
  /** Tailwind gradient classes for the badge. */
  gradient: string;
  /** Solid accent (text/border) for compact chips. */
  accent: string;
  emoji: string;
};

const METAL: Record<TierName, { gradient: string; accent: string; emoji: string }> = {
  Bronze: { gradient: "from-amber-700 to-orange-600", accent: "text-amber-700", emoji: "🥉" },
  Silver: { gradient: "from-slate-400 to-slate-500", accent: "text-slate-500", emoji: "🥈" },
  Gold: { gradient: "from-yellow-400 to-amber-500", accent: "text-amber-500", emoji: "🥇" },
  Platinum: { gradient: "from-cyan-300 to-teal-400", accent: "text-teal-500", emoji: "💠" },
  Diamond: { gradient: "from-sky-400 to-indigo-500", accent: "text-sky-500", emoji: "💎" },
  Master: { gradient: "from-fuchsia-500 to-purple-600", accent: "text-purple-500", emoji: "🔮" },
  Grandmaster: { gradient: "from-rose-500 to-red-600", accent: "text-rose-500", emoji: "👑" },
  Legend: { gradient: "from-amber-300 via-rose-400 to-violet-500", accent: "text-rose-500", emoji: "🌟" },
};

function t(floor: number, name: TierName, division: "I" | "II" | "III" | ""): Tier {
  const m = METAL[name];
  return {
    floor,
    name,
    division,
    label: division ? `${name} ${division}` : name,
    gradient: m.gradient,
    accent: m.accent,
    emoji: m.emoji,
  };
}

// Ordered low → high. Each entry owns [floor, nextFloor).
export const TIERS: Tier[] = [
  t(0, "Bronze", "I"), t(1000, "Bronze", "II"), t(1100, "Bronze", "III"),
  t(1200, "Silver", "I"), t(1300, "Silver", "II"), t(1400, "Silver", "III"),
  t(1500, "Gold", "I"), t(1600, "Gold", "II"), t(1700, "Gold", "III"),
  t(1800, "Platinum", "I"), t(1900, "Platinum", "II"), t(2000, "Platinum", "III"),
  t(2100, "Diamond", "I"), t(2200, "Diamond", "II"), t(2300, "Diamond", "III"),
  t(2400, "Master", "I"), t(2500, "Master", "II"), t(2600, "Master", "III"),
  t(2700, "Grandmaster", ""), t(3000, "Legend", ""),
];

/** The division a rating currently sits in. */
export function tierForRating(rating: number): Tier {
  let current = TIERS[0];
  for (const tier of TIERS) {
    if (rating >= tier.floor) current = tier;
    else break;
  }
  return current;
}

export type Progress = {
  tier: Tier;
  /** Next division up, or null at Legend. */
  next: Tier | null;
  /** 0–100 progress through the current division toward `next`. */
  pct: number;
  /** Rating points still needed to reach `next` (0 at the top). */
  toNext: number;
  /** Next *named metal* up (e.g. from any Silver → Gold), or null if already top metal. */
  nextMetal: Tier | null;
  /** Points needed to reach the next metal — drives "47 points to reach Gold". */
  toNextMetal: number;
};

/** Where a rating sits, and how far to the next milestone. */
export function ratingProgress(rating: number): Progress {
  const tier = tierForRating(rating);
  const idx = TIERS.indexOf(tier);
  const next = idx < TIERS.length - 1 ? TIERS[idx + 1] : null;

  const span = next ? next.floor - tier.floor : 1;
  const into = rating - tier.floor;
  const pct = next ? Math.max(0, Math.min(100, Math.round((into / span) * 100))) : 100;
  const toNext = next ? Math.max(0, next.floor - rating) : 0;

  const nextMetal = TIERS.find((x) => x.floor > rating && x.name !== tier.name) ?? null;
  const toNextMetal = nextMetal ? Math.max(0, nextMetal.floor - rating) : 0;

  return { tier, next, pct, toNext, nextMetal, toNextMetal };
}

// ---- Elo maths (mirror of the SQL; see migration 0016) --------------------

/** Probability the player out-scores a test of the given difficulty. */
export function expected(rating: number, difficulty: number): number {
  return 1 / (1 + Math.pow(10, (difficulty - rating) / 400));
}

export function kFactor(rating: number, ratedCount: number): number {
  if (ratedCount < 10) return 48;
  if (rating < 2000) return 32;
  if (rating < 2400) return 24;
  return 16;
}

/**
 * Preview the rating change for an attempt — used for "what would I gain?" UI.
 * `recentAcc` is the mean accuracy (0–1) over the last ≤5 rated tests, or null.
 */
export function ratingDelta(
  rating: number,
  difficulty: number,
  accuracy: number,
  ratedCount: number,
  recentAcc: number | null = null,
): number {
  const acc = Math.max(0, Math.min(1, accuracy));
  const e = expected(rating, difficulty);
  let delta = Math.round(kFactor(rating, ratedCount) * (acc - e));
  if (delta > 0) {
    const c = recentAcc == null ? 1 : recentAcc >= 0.75 ? 1.15 : recentAcc >= 0.6 ? 1.05 : 1;
    delta = Math.round(delta * c);
  }
  return Math.max(-40, Math.min(50, delta));
}

/** Weekly/monthly points for an attempt (always ≥ 1 when rated). */
export function pointsFor(accuracy: number, difficulty: number): number {
  const acc = Math.max(0, Math.min(1, accuracy));
  const factor = Math.max(0.6, Math.min(1.8, difficulty / 1500));
  return Math.max(1, Math.round(Math.pow(acc, 1.5) * 100 * factor));
}

/** Rough IELTS Reading band implied by a rating (for a friendly hint). */
export function estimatedBand(rating: number): number {
  // 1000 ≈ 5.0 … 2700 ≈ 9.0, clamped.
  const band = 5 + ((rating - 1000) / 1700) * 4;
  return Math.max(3, Math.min(9, Math.round(band * 2) / 2));
}
