// Premium-membership helpers, shared by pages, the test-html route, and the
// admin members UI.

export function isPremiumActive(p: { premium_until: string | null }): boolean {
  return !!p.premium_until && new Date(p.premium_until).getTime() > Date.now();
}

// Access rules: free tests are open to all; premium tests need an active
// membership or an admin. There is no per-test XP unlock — that mechanic was
// removed, along with the `unlocks` table it read.
export function canAccessTest(
  profile: { role: string; premium_until: string | null },
  test: { tier: string },
): boolean {
  if (test.tier !== "premium") return true;
  return profile.role === "admin" || isPremiumActive(profile);
}

/** Days before the end when a member starts being reminded. */
export const EXPIRING_DAYS = 7;
/** Days after the end during which a lapsed member is still nudged to renew. */
export const LAPSED_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export type MembershipStage =
  /** Never had Premium. */
  | "none"
  /** Active, more than EXPIRING_DAYS left. */
  | "active"
  /** Active, ends within EXPIRING_DAYS. */
  | "expiring"
  /** Ended within the last LAPSED_DAYS. */
  | "lapsed"
  /** Ended longer ago than that. */
  | "expired";

/**
 * Where a membership stands, and how many whole days until it ends
 * (`expiring`, never below 1) or since it ended (`lapsed` / `expired`).
 * One rule for the student renewal banner and the admin member filter, so the
 * owner sees exactly the group the banner is shown to.
 */
export function membershipStage(
  premiumUntil: string | null | undefined,
  now: number = Date.now(),
): { stage: MembershipStage; days: number } {
  if (!premiumUntil) return { stage: "none", days: 0 };
  const end = new Date(premiumUntil).getTime();
  if (Number.isNaN(end)) return { stage: "none", days: 0 };
  if (end > now) {
    const days = Math.max(1, Math.ceil((end - now) / DAY_MS));
    return { stage: days <= EXPIRING_DAYS ? "expiring" : "active", days };
  }
  const days = Math.floor((now - end) / DAY_MS);
  return { stage: days < LAPSED_DAYS ? "lapsed" : "expired", days };
}
