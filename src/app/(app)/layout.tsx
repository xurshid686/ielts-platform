import { AppShell } from "@/components/app-shell";
import { PremiumWelcome } from "@/components/premium-welcome";
import { requireProfile } from "@/lib/auth";
import { isPremiumActive } from "@/lib/premium";
import { createClient } from "@/lib/supabase/server";
import type { Notification } from "@/types/database";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  const supabase = await createClient();

  // Lazily deliver this week's progress report (idempotent; fires on Sunday).
  // Degrades silently if migration 0017 hasn't been applied yet.
  await supabase.rpc("ensure_weekly_report").then(
    () => {},
    () => {},
  );

  const { data: notifications } = await supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(12);

  return (
    <AppShell profile={profile} notifications={(notifications ?? []) as Notification[]}>
      <PremiumWelcome
        show={profile.premium_announce && isPremiumActive(profile)}
        until={profile.premium_until}
      />
      {children}
    </AppShell>
  );
}
