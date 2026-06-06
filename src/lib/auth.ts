import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/types/database";

/** Returns the signed-in user's profile or redirects to /login. */
export async function requireProfile(): Promise<Profile> {
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
  if (!profile) {
    return {
      id: user.id,
      name: (user.user_metadata?.full_name as string) ?? user.email?.split("@")[0] ?? "Student",
      email: user.email ?? null,
      avatar_url: (user.user_metadata?.avatar_url as string) ?? null,
      role: "student",
      streak: 0,
      longest_streak: 0,
      last_activity_date: null,
      xp: 0,
      created_at: new Date().toISOString(),
    };
  }

  return profile;
}

export async function requireAdmin(): Promise<Profile> {
  const profile = await requireProfile();
  if (profile.role !== "admin") redirect("/dashboard");
  return profile;
}
