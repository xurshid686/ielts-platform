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
  GraduationCap,
  Award,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { AccountMenu } from "@/components/account-menu";
import { cn } from "@/lib/utils";
import type { Profile } from "@/types/database";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/reading", label: "Reading", icon: BookOpen },
  { href: "/listening", label: "Listening", icon: Headphones },
  { href: "/writing", label: "Writing", icon: PenLine },
  { href: "/speaking", label: "Speaking", icon: Mic },
  { href: "/badges", label: "Badges", icon: Award },
];

export function AppShell({
  profile,
  children,
}: {
  profile: Profile;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const nav = [...NAV];
  if (profile.role === "admin") {
    nav.push({ href: "/admin", label: "Admin", icon: Shield });
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-[260px] border-r border-border bg-surface p-4 transition-transform lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-gradient text-white shadow-[var(--shadow-primary)]">
              <GraduationCap className="h-5 w-5" />
            </span>
            IELTS
          </Link>
          <button className="lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="mt-6 space-y-1">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted hover:bg-surface-2 hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="absolute inset-x-4 bottom-4 rounded-xl border border-border bg-surface-2 p-3 shadow-soft">
          <div className="flex items-center gap-2 text-sm">
            <Flame className="h-4 w-4 text-warning" />
            <span className="font-semibold tabular-nums">{profile.streak}-day streak</span>
          </div>
          <p className="mt-1 text-xs text-muted tabular-nums">
            {profile.xp} XP · best {profile.longest_streak}🔥
          </p>
        </div>
      </aside>

      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Main column */}
      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-background/80 px-4 py-3 backdrop-blur lg:px-8">
          <button className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <div className="hidden lg:block" />
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <AccountMenu profile={profile} />
          </div>
        </header>

        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
