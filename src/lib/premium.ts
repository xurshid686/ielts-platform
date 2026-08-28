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
