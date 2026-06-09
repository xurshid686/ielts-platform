// Achievement badges — computed on the fly from a user's profile + results.
// No table needed: a badge is "earned" when its rule passes over existing data,
// and (where derivable) we surface the date of the qualifying event.

export type BadgeGroup =
  | "Milestones"
  | "Streaks"
  | "Mastery"
  | "Precision"
  | "Explorer"
  | "Quirky";

export type BadgeTier = "bronze" | "silver" | "gold" | "platinum";

export type BadgeDef = {
  id: string;
  name: string;
  description: string; // how to earn it
  emoji: string;
  group: BadgeGroup;
  tier: BadgeTier;
};

export type BadgeStatus = {
  def: BadgeDef;
  earned: boolean;
  earnedAt: string | null;
  progress?: { current: number; target: number };
};

export type BadgeInput = {
  streak: number;
  longestStreak: number;
  xp: number;
  results: {
    skill: string;
    raw: number | null;
    total: number | null;
    band: number | null;
    submitted_at: string;
  }[];
  speaking: { score: number | null; created_at: string }[];
};

export const TIER_STYLES: Record<BadgeTier, { ring: string; chip: string; label: string }> = {
  bronze: { ring: "ring-amber-700/40", chip: "bg-amber-700/15 text-amber-700", label: "Bronze" },
  silver: { ring: "ring-slate-400/50", chip: "bg-slate-400/15 text-slate-500", label: "Silver" },
  gold: { ring: "ring-yellow-500/50", chip: "bg-yellow-500/15 text-yellow-600", label: "Gold" },
  platinum: {
    ring: "ring-cyan-400/50",
    chip: "bg-cyan-400/15 text-cyan-500",
    label: "Platinum",
  },
};

// ---- helpers --------------------------------------------------------------
const hourOf = (iso: string) => new Date(iso).getUTCHours();
const dayOf = (iso: string) => new Date(iso).getUTCDay(); // 0 Sun .. 6 Sat

export function computeBadges(input: BadgeInput): BadgeStatus[] {
  const { streak, longestStreak, xp, results, speaking } = input;

  // Unified, chronologically-sorted activity stream (oldest first).
  const activity = [
    ...results.map((r) => ({
      at: r.submitted_at,
      skill: r.skill,
      band: r.band != null ? Number(r.band) : null,
      raw: r.raw,
      total: r.total,
    })),
    ...speaking.map((s) => ({
      at: s.created_at,
      skill: "speaking",
      band: s.score != null ? Number(s.score) : null,
      raw: null as number | null,
      total: null as number | null,
    })),
  ].sort((a, b) => +new Date(a.at) - +new Date(b.at));

  const totalDone = activity.length;
  const dateOfNth = (n: number) => (activity[n - 1] ? activity[n - 1].at : null);

  const countSkill = (skill: string) =>
    skill === "speaking" ? speaking.length : results.filter((r) => r.skill === skill).length;
  const dateOfNthSkill = (skill: string, n: number) => {
    const xs = activity.filter((a) => a.skill === skill);
    return xs[n - 1] ? xs[n - 1].at : null;
  };

  const skillsPracticed = new Set(activity.map((a) => a.skill));

  // Earliest activity whose band reaches a threshold.
  const firstBandAtLeast = (b: number) =>
    activity.find((a) => a.band != null && a.band >= b)?.at ?? null;
  const maxBand = activity.reduce((m, a) => (a.band != null && a.band > m ? a.band : m), 0);

  // Earliest test matching an accuracy predicate.
  const firstWhere = (pred: (a: (typeof activity)[number]) => boolean) =>
    activity.find(pred)?.at ?? null;

  const out: BadgeStatus[] = [];
  const push = (
    def: BadgeDef,
    earned: boolean,
    earnedAt: string | null,
    progress?: { current: number; target: number },
  ) => out.push({ def, earned, earnedAt, progress });

  // ---- Milestones (total completions) ----
  const milestones: [string, string, string, number, BadgeTier][] = [
    ["first-steps", "First Steps", "🎯", 1, "bronze"],
    ["getting-serious", "Getting Serious", "📚", 10, "silver"],
    ["dedicated", "Dedicated", "🗓️", 25, "gold"],
    ["centurion", "Centurion", "🏛️", 100, "platinum"],
  ];
  for (const [id, name, emoji, target, tier] of milestones) {
    push(
      { id, name, emoji, group: "Milestones", tier, description: `Complete ${target} test${target > 1 ? "s" : ""}.` },
      totalDone >= target,
      totalDone >= target ? dateOfNth(target) : null,
      { current: Math.min(totalDone, target), target },
    );
  }

  // ---- Streaks (longest streak reached) ----
  const streaks: [string, string, string, number, BadgeTier][] = [
    ["spark", "Spark", "✨", 3, "bronze"],
    ["on-fire", "On Fire", "🔥", 7, "silver"],
    ["unstoppable", "Unstoppable", "⚡", 14, "gold"],
    ["inferno", "Inferno", "🌋", 30, "platinum"],
  ];
  for (const [id, name, emoji, target, tier] of streaks) {
    push(
      { id, name, emoji, group: "Streaks", tier, description: `Reach a ${target}-day streak.` },
      longestStreak >= target,
      null,
      { current: Math.min(Math.max(streak, longestStreak), target), target },
    );
  }

  // ---- Mastery (band milestones) ----
  const bandBadges: [string, string, string, number, BadgeTier][] = [
    ["solid-six", "Solid Six", "🥉", 6, "bronze"],
    ["lucky-seven", "Lucky Seven", "🥈", 7, "silver"],
    ["elite-eight", "Elite Eight", "🥇", 8, "gold"],
    ["perfect-nine", "Perfect Nine", "💎", 9, "platinum"],
  ];
  for (const [id, name, emoji, target, tier] of bandBadges) {
    push(
      { id, name, emoji, group: "Mastery", tier, description: `Score Band ${target} or higher in any test.` },
      maxBand >= target,
      firstBandAtLeast(target),
      { current: Math.min(maxBand, target), target },
    );
  }

  // ---- Precision ----
  const flawlessAt = firstWhere((a) => a.total != null && a.total > 0 && a.raw === a.total);
  push(
    { id: "flawless", name: "Flawless", emoji: "💯", group: "Precision", tier: "gold", description: "Get every question right in a test." },
    !!flawlessAt,
    flawlessAt,
  );
  const sniperAt = firstWhere(
    (a) => a.total != null && a.total > 0 && a.raw != null && a.raw / a.total >= 0.9,
  );
  push(
    { id: "sniper", name: "Sniper", emoji: "🎯", group: "Precision", tier: "silver", description: "Score 90%+ accuracy in a test." },
    !!sniperAt,
    sniperAt,
  );

  // ---- Skill mastery ----
  const skillBadges: [string, string, string, string, number, BadgeTier][] = [
    ["bookworm", "Bookworm", "🐛", "reading", 10, "silver"],
    ["keen-ear", "Keen Ear", "👂", "listening", 10, "silver"],
    ["orator", "Orator", "🎤", "speaking", 5, "silver"],
  ];
  for (const [id, name, emoji, skill, target, tier] of skillBadges) {
    const c = countSkill(skill);
    push(
      { id, name, emoji, group: "Mastery", tier, description: `Finish ${target} ${skill} tests.` },
      c >= target,
      c >= target ? dateOfNthSkill(skill, target) : null,
      { current: Math.min(c, target), target },
    );
  }

  // ---- Explorer ----
  const distinct = skillsPracticed.size;
  push(
    { id: "all-rounder", name: "All-Rounder", emoji: "🌍", group: "Explorer", tier: "silver", description: "Practise 3 different skills." },
    distinct >= 3,
    null,
    { current: Math.min(distinct, 3), target: 3 },
  );
  push(
    { id: "polyglot", name: "Quadathlete", emoji: "🧭", group: "Explorer", tier: "gold", description: "Practise all 4 skills." },
    distinct >= 4,
    null,
    { current: Math.min(distinct, 4), target: 4 },
  );

  // ---- XP ----
  const xpBadges: [string, string, string, number, BadgeTier][] = [
    ["rising-star", "Rising Star", "⭐", 500, "silver"],
    ["xp-legend", "XP Legend", "🌟", 2500, "platinum"],
  ];
  for (const [id, name, emoji, target, tier] of xpBadges) {
    push(
      { id, name, emoji, group: "Milestones", tier, description: `Earn ${target.toLocaleString()} XP.` },
      xp >= target,
      null,
      { current: Math.min(xp, target), target },
    );
  }

  // ---- Quirky (time-of-day / day-of-week) ----
  const nightAt = firstWhere((a) => hourOf(a.at) < 4);
  push(
    { id: "night-owl", name: "Night Owl", emoji: "🦉", group: "Quirky", tier: "bronze", description: "Finish a test after midnight." },
    !!nightAt,
    nightAt,
  );
  const earlyAt = firstWhere((a) => hourOf(a.at) >= 5 && hourOf(a.at) < 8);
  push(
    { id: "early-bird", name: "Early Bird", emoji: "🐦", group: "Quirky", tier: "bronze", description: "Finish a test before 8am." },
    !!earlyAt,
    earlyAt,
  );
  const weekendAt = firstWhere((a) => dayOf(a.at) === 0 || dayOf(a.at) === 6);
  push(
    { id: "weekend-warrior", name: "Weekend Warrior", emoji: "🛡️", group: "Quirky", tier: "bronze", description: "Practise on a weekend." },
    !!weekendAt,
    weekendAt,
  );

  return out;
}
