import { SiteHeader } from "@/components/site-header";
import { ChromeSwitch } from "@/components/chrome-switch";
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
  // /admin/* brings its own full-screen shell; ChromeSwitch drops the student
  // header and the capped <main> there.
  return (
    <ChromeSwitch
      header={
        <SiteHeader
          profile={profile}
          notifications={notifications}
          discipline={discipline}
          variant="app"
        />
      }
    >
      {children}
    </ChromeSwitch>
  );
}
