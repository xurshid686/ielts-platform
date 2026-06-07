"use server";

import { createClient } from "@/lib/supabase/server";

// Clears the one-time premium congratulations flag once the user has seen it.
// Updating one's own profile is allowed by RLS (profiles_update_self).
export async function dismissPremiumAnnounce(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("profiles").update({ premium_announce: false }).eq("id", user.id);
}
