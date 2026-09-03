import { SiteHeader } from "@/components/site-header";
import type { Profile, Notification } from "@/types/database";

/**
 * Chrome for a signed-in student.
 *
 * This used to be a fixed 260px left sidebar with grouped nav, a mobile
 * translate-x drawer and a streak card at its foot, laid out by an outer
 * `lg:grid-cols-[260px_1fr]`. It is now a top bar shared with the logged-out
 * pages — see site-header.tsx for where each of those pieces went.
 *
 * Nothing else in the app offset itself against the old sidebar (no page
 * carried an `ml-64`-style margin), which is why removing that grid did not
 * ripple outwards.
 */
export function AppShell({
  profile,
  notifications = [],
  discipline = false,
  children,
}: {
  profile: Profile;
  notifications?: Notification[];
  discipline?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader
        profile={profile}
        notifications={notifications}
        discipline={discipline}
        variant="app"
      />
      {/* The old sidebar ate 260px, so pages never had to cap their own width.
          Without it they ran edge to edge on a wide monitor. */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  );
}
