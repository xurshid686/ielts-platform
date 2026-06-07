// Premium-membership helpers, shared by pages, the test-html route, and the
// admin members UI.

export function isPremiumActive(p: { premium_until: string | null }): boolean {
  return !!p.premium_until && new Date(p.premium_until).getTime() > Date.now();
}

// XP cost to permanently unlock a single premium test. Mirrors unlock_test() in
// the DB (the DB is authoritative — this is for display + affordability checks).
export function unlockCost(test: { kind: "single" | "full" }): number {
  return test.kind === "full" ? 150 : 60;
}

// Access rules: free tests are open to all; premium tests need an active
// membership, an admin, OR a one-off XP unlock of that specific test.
export function canAccessTest(
  profile: { role: string; premium_until: string | null },
  test: { tier: string },
  unlocked = false,
): boolean {
  if (test.tier !== "premium") return true;
  if (profile.role === "admin" || isPremiumActive(profile)) return true;
  return unlocked;
}
