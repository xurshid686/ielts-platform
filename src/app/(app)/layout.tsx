import { AppShell } from "@/components/app-shell";
import { PremiumWelcome } from "@/components/premium-welcome";
import { requireProfile } from "@/lib/auth";
import { isPremiumActive } from "@/lib/premium";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  return (
    <AppShell profile={profile}>
      <PremiumWelcome
        show={profile.premium_announce && isPremiumActive(profile)}
        until={profile.premium_until}
      />
      {children}
    </AppShell>
  );
}
