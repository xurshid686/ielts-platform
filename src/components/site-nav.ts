import {
  LayoutDashboard,
  BookOpen,
  Headphones,
  PenLine,
  Mic,
  Trophy,
  Shield,
  Target,
  Send,
} from "lucide-react";
import { CONTACT_TELEGRAM_URL } from "@/lib/site";
import type { Profile } from "@/types/database";

export type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  /**
   * Renders a plain <a target="_blank"> instead of a next/link <Link>. `href`
   * is then an absolute URL, so it must never be matched against `pathname`.
   */
  external?: boolean;
};

/**
 * The one nav definition, shared by the signed-in and logged-out headers so the
 * site does not change shape at login.
 *
 * This replaced the grouped `NAV_GROUPS` the left sidebar used: a horizontal bar
 * has nowhere to put "Practise" / "Compete" headings, and the groups only ever
 * existed to break up a tall column.
 *
 * Links that did not earn a slot on the bar were NOT deleted — /refer and the
 * beginner-track page live in the account dropdown (see account-menu.tsx).
 */
export function navItemsFor(
  profile: Profile | null,
  opts: { discipline?: boolean } = {},
): NavItem[] {
  // A visitor with no account can only use the two public catalogues; a bar
  // full of links that all bounce to /login would be worse than no nav at all.
  if (!profile) {
    return [
      { href: "/reading", label: "Reading", icon: BookOpen },
      { href: "/listening", label: "Listening", icon: Headphones },
      { href: CONTACT_TELEGRAM_URL, label: "Contact", icon: Send, external: true },
    ];
  }

  const items: NavItem[] = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/reading", label: "Reading", icon: BookOpen },
    { href: "/listening", label: "Listening", icon: Headphones },
    { href: "/writing", label: "Writing", icon: PenLine },
    { href: "/speaking", label: "Speaking", icon: Mic },
  ];

  // Invisible to everyone who has not been picked for the challenge — no menu
  // entry, and the page itself redirects. Admins see it to review the program.
  if (opts.discipline || profile.role === "admin") {
    items.push({ href: "/discipline", label: "Discipline", icon: Target });
  }

  items.push({ href: "/leaderboard", label: "Leaderboard", icon: Trophy });

  if (profile.role === "admin") {
    items.push({ href: "/admin", label: "Admin", icon: Shield });
  }

  return items;
}

/** Active-state rule, shared so the bar and the mobile panel cannot disagree. */
export function isActive(pathname: string, item: NavItem): boolean {
  if (item.external) return false;
  return pathname === item.href || pathname.startsWith(item.href + "/");
}
