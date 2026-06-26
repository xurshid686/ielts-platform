"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  BookOpen,
  Headphones,
  PenLine,
  Mic,
  Shield,
  Flame,
  Menu,
  X,
  Award,
  Trophy,
  Zap,
  Gift,
  GraduationCap,
  Compass,
  ClipboardList,
  MessageSquare,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { AccountMenu } from "@/components/account-menu";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { cn } from "@/lib/utils";
import { LEVELS } from "@/lib/levels";
import type { Profile, Notification } from "@/types/database";

type NavItem = { href: string; label: string; icon: typeof LayoutDashboard };

const NAV_GROUPS: { label: string | null; items: NavItem[] }[] = [
  {
    label: null,
    items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Practise",
    items: [
      { href: "/reading", label: "Reading", icon: BookOpen },
      { href: "/listening", label: "Listening", icon: Headphones },
      { href: "/writing", label: "Writing", icon: PenLine },
      { href: "/speaking", label: "Speaking", icon: Mic },
    ],
  },
  {
    label: "Compete",
    items: [
      { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
      { href: "/badges", label: "Badges", icon: Award },
      { href: "/refer", label: "Invite friends", icon: Gift },
    ],
  },
];

export function AppShell({
  profile,
  notifications = [],
  children,
}: {
  profile: Profile;
  notifications?: Notification[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const homeHref = "/dashboard";

  const groups: typeof NAV_GROUPS = [...NAV_GROUPS];
  // My-students get an "Assignments" + "Feedback" group right under Dashboard.
  if (profile.is_my_student) {
    groups.splice(1, 0, {
      label: "My teacher",
      items: [
        { href: "/assignments", label: "Assignments", icon: ClipboardList },
        { href: "/feedback", label: "Feedback", icon: MessageSquare },
      ],
    });
  }
  // Beginner-track menu — visible only to students assigned that level. Sits
  // right under Dashboard, above the full IELTS "Practise" group.
  if (profile.level === "pre_ielts" || profile.level === "intro") {
    const meta = LEVELS[profile.level];
    const Icon = profile.level === "pre_ielts" ? GraduationCap : Compass;
    groups.splice(1, 0, {
      label: "My level",
      items: [{ href: meta.href, label: meta.label, icon: Icon }],
    });
  }
  if (profile.role === "admin") {
    groups.push({
      label: "Manage",
      items: [{ href: "/admin", label: "Admin", icon: Shield }],
    });
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[260px] flex-col border-r border-border bg-surface transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 lg:self-start",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between p-4 pb-2">
          <Link href={homeHref} className="flex items-center gap-2.5 font-semibold">
            <Logo size={36} />
            IELTS
          </Link>
          <button
            className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-foreground lg:hidden"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto p-4 pt-4">
          {groups.map((group, gi) => (
            <div key={group.label ?? gi}>
              {group.label && (
                <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted/70">
                  {group.label}
                </p>
              )}
              <div className="space-y-1">
                {group.items.map(({ href, label, icon: Icon }) => {
                  const active = pathname === href || pathname.startsWith(href + "/");
                  return (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        active
                          ? "bg-primary/10 text-primary"
                          : "text-muted hover:bg-surface-2 hover:text-foreground",
                      )}
                    >
                      {/* Active indicator bar */}
                      <span
                        className={cn(
                          "absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary transition-opacity",
                          active ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <Icon
                        className={cn(
                          "h-4 w-4 transition-transform duration-200",
                          !active && "group-hover:scale-110",
                        )}
                      />
                      {label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Streak card */}
        <div className="p-4 pt-0">
          <div className="relative overflow-hidden rounded-xl border border-primary/15 bg-gradient-to-br from-primary/8 via-surface-2 to-accent/8 p-3.5 shadow-soft">
            <div className="flex items-center gap-2 text-sm">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-warning/15">
                <Flame className="h-4 w-4 text-warning" />
              </span>
              <span className="font-semibold tabular-nums">{profile.streak}-day streak</span>
            </div>
            <div className="mt-2 flex items-center gap-3 text-xs text-muted tabular-nums">
              <span className="inline-flex items-center gap-1">
                <Zap className="h-3 w-3 text-primary" /> {profile.xp} XP
              </span>
              <span className="inline-flex items-center gap-1">
                <Trophy className="h-3 w-3 text-warning" /> best {profile.longest_streak}
              </span>
            </div>
          </div>
        </div>
      </aside>

      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Main column */}
      <div className="flex min-h-screen flex-col">
        <header className="glass sticky top-0 z-20 flex items-center justify-between border-b border-border/60 px-4 py-3 lg:px-8">
          <button
            className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-foreground lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="hidden lg:block" />
          <div className="flex items-center gap-1.5">
            <NotificationBell notifications={notifications} />
            <ThemeToggle />
            <AccountMenu profile={profile} />
          </div>
        </header>

        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
