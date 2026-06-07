// Premium-membership helpers, shared by pages, the test-html route, and the
// admin members UI.

export function isPremiumActive(p: { premium_until: string | null }): boolean {
  return !!p.premium_until && new Date(p.premium_until).getTime() > Date.now();
}

// Admins always have access; otherwise premium tests need an active membership.
export function canAccessTest(
  profile: { role: string; premium_until: string | null },
  test: { tier: string },
): boolean {
  if (test.tier !== "premium") return true;
  return profile.role === "admin" || isPremiumActive(profile);
}
