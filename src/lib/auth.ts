import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Level, Profile } from "@/types/database";

/**
 * The viewer's profile, or null when nobody is signed in.
 *
 * Used by the public pages (the reading/listening catalogue and a test's detail
 * page), which render for anonymous visitors: they arrive from Telegram or a
 * search engine and must be able to see what exists before being asked to
 * register. Pages that genuinely require an account keep using requireProfile().
 *
 * Wrapped in React's `cache()` so it runs ONCE per request, not once per
 * caller. Rendering /reading called it twice — `(app)/layout.tsx` for the shell
 * and `skill-section.tsx` for the catalogue — and each call is a `getUser()`
 * round trip to Supabase (it revalidates the JWT over the network) plus a
 * profiles select. The cache is per-request, so it never leaks one viewer's
 * profile into another's render.
 */
export const getProfile = cache(async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return (profile as Profile | null) ?? fallbackProfile(user);
});

/**
 * Returns the signed-in user's profile or redirects to /login.
 *
 * Wrapped in `cache()` for the same reason getProfile() is, and it was not:
 * every account-only page calls this, several of them alongside a layout or a
 * component that calls it again, and each call is a getUser() round trip that
 * revalidates the JWT over the network plus a profiles select. Per-request, so
 * it never leaks one viewer's profile into another's render.
 *
 * `redirect()` throws, and React's cache replays a rejected promise to later
 * callers, so the redirect still happens for every caller in the request.
 */
export const requireProfile = cache(async function requireProfile(): Promise<Profile> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  // Fallback in the rare window before the signup trigger has run.
  return (profile as Profile | null) ?? fallbackProfile(user);
});

/** Stand-in profile for the window between signup and the DB trigger firing. */
function fallbackProfile(user: {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown>;
}): Profile {
  return {
    id: user.id,
    name: (user.user_metadata?.full_name as string) ?? user.email?.split("@")[0] ?? "Student",
    email: user.email ?? null,
    avatar_url: (user.user_metadata?.avatar_url as string) ?? null,
    role: "student",
    level: "regular",
    is_owner: false,
    premium_until: null,
    premium_announce: false,
    target_band: null,
    streak: 0,
    longest_streak: 0,
    last_activity_date: null,
    xp: 0,
    rating: 1000,
    peak_rating: 1000,
    rated_count: 0,
    timezone: "UTC",
    referral_code: null,
    referred_by: null,
    hidden_from_leaderboard: false,
    created_at: new Date().toISOString(),
  };
}

export async function requireAdmin(): Promise<Profile> {
  const profile = await requireProfile();
  if (profile.role !== "admin") redirect("/dashboard");
  return profile;
}

/** Owner-only pages (managing admins). Other admins are sent back to /admin. */
export async function requireOwner(): Promise<Profile> {
  const profile = await requireAdmin();
  if (!profile.is_owner) redirect("/admin");
  return profile;
}

/**
 * Gate a page to students of a given level. Admins always pass (so they can
 * preview the content). Everyone else is sent back to their dashboard.
 */
export async function requireLevel(level: Exclude<Level, "regular">): Promise<Profile> {
  const profile = await requireProfile();
  if (profile.role !== "admin" && profile.level !== level) redirect("/dashboard");
  return profile;
}
