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

  // The weekly progress report is built by the cron at
  // /api/cron/weekly-reports (vercel.json: Sundays 17:00 UTC), which calls
  // cron_weekly_reports() for every active user.
  //
  // This layout used to `await rpc("ensure_weekly_report")` here as a lazy
  // fallback, with both callbacks empty — so every authenticated page render
  // blocked on a round trip that duplicated the cron's job and could not
  // report its own failure. `ensure_weekly_report` is left defined in the
  // database; nothing calls it from the app any more.

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
