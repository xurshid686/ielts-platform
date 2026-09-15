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
  ClipboardCheck,
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
  /**
   * Sub-pages shown in a dropdown on the bar and listed under the item in the
   * mobile panel. Used for Admin, so admin sections are reachable from anywhere
   * without adding a bar item (a ninth item overflowed the bar at 1280px).
   */
  children?: { href: string; label: string }[];
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

  // Visible to every signed-in STUDENT, unlike /discipline: a mock is something a
  // student REQUESTS, so they have to be able to find the page to ask (0050).
  // Not for admins — they run mocks from /admin/mocks, and a ninth item
  // overflowed the admin bar at 1280px. The short label keeps a student's bar no
  // wider than the admin bar already is ("Mock" is narrower than "Admin").
  if (profile.role !== "admin") {
    items.push({ href: "/mock", label: "Mock", icon: ClipboardCheck });
  }

  // Invisible to everyone who has not been picked for the challenge — no menu
  // entry, and the page itself redirects. The layout passes `discipline`, which
  // is already true for admins so they can review the programme.
  if (opts.discipline) {
    items.push({ href: "/discipline", label: "Discipline", icon: Target });
  }

  items.push({ href: "/leaderboard", label: "Leaderboard", icon: Trophy });

  if (profile.role === "admin") {
    items.push({
      href: "/admin",
      label: "Admin",
      icon: Shield,
      children: [
        { href: "/admin", label: "Overview" },
        { href: "/admin/mocks", label: "Mock exams" },
        { href: "/admin/discipline", label: "Discipline" },
        { href: "/admin/tests", label: "Tests" },
        { href: "/admin/members", label: "Members & premium" },
        ...(profile.is_owner ? [{ href: "/admin/team", label: "Admins" }] : []),
      ],
    });
  }

  return items;
}

/** Active-state rule, shared so the bar and the mobile panel cannot disagree. */
export function isActive(pathname: string, item: NavItem): boolean {
  if (item.external) return false;
  return pathname === item.href || pathname.startsWith(item.href + "/");
}
