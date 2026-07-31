import { AppShell } from "@/components/app-shell";
import { PublicShell } from "@/components/public-shell";
import { PremiumWelcome } from "@/components/premium-welcome";
import { TimezoneSync } from "@/components/timezone-sync";
import { ReferralRedeemer } from "@/components/referral-redeemer";
import { getProfile } from "@/lib/auth";
import { isPremiumActive } from "@/lib/premium";
import { createClient } from "@/lib/supabase/server";
import type { Notification } from "@/types/database";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Not every page in this group needs an account any more: the reading and
  // listening catalogues and each test's detail page are public, so a visitor
  // arriving from Telegram or a search engine can see what exists before being
  // asked to register. The account-only pages are still guarded — by the proxy
  // (/dashboard, /admin, …) and by requireProfile() inside the pages
  // themselves — so falling through to a public shell here is safe.
  const profile = await getProfile();
  if (!profile) return <PublicShell>{children}</PublicShell>;

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
      <TimezoneSync current={profile.timezone ?? "UTC"} />
      <ReferralRedeemer />
      <PremiumWelcome
        show={profile.premium_announce && isPremiumActive(profile)}
        until={profile.premium_until}
      />
      {children}
    </AppShell>
  );
}
