"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X, Flame, Zap } from "lucide-react";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { AccountMenu } from "@/components/account-menu";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { navItemsFor, isActive, type NavItem } from "@/components/site-nav";
import { cn } from "@/lib/utils";
import type { Profile, Notification } from "@/types/database";

/**
 * The site's one header, used signed-in and signed-out.
 *
 * It replaced a 260px left sidebar (AppShell) and a separate hand-written guest
 * header (PublicShell) that shared no markup, so the site changed shape at
 * login. Everything the sidebar carried is still reachable: the links that did
 * not fit the bar moved into AccountMenu, and the sidebar's streak card is the
 * flame chip here (XP and best streak are in that dropdown).
 *
 * `variant` only controls the inner width — the guest pages are a centred
 * max-w-6xl column, the app pages run full-bleed — never which links appear.
 * That comes from navItemsFor(profile), so the two can never drift.
 */
export function SiteHeader({
  profile,
  notifications = [],
  discipline = false,
  variant = "app",
}: {
  profile: Profile | null;
  notifications?: Notification[];
  discipline?: boolean;
  variant?: "app" | "public";
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const items = navItemsFor(profile, { discipline });
  const inner =
    variant === "public"
      ? "mx-auto w-full max-w-6xl px-4"
      : "w-full px-4 lg:px-8";

  return (
    <header className="glass sticky top-0 z-40 border-b border-border/60">
      <div className={cn("flex h-16 items-center gap-3", inner)}>
        <button
          className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-foreground lg:hidden"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>

        <Link
          href={profile ? "/dashboard" : "/"}
          className="flex shrink-0 items-center gap-2.5 font-semibold"
        >
          <Logo size={32} />
          <span className="hidden sm:inline">IELTS</span>
        </Link>

        {/* The bar itself — desktop only; below lg these live in the panel. */}
        <nav className="hidden min-w-0 flex-1 items-center gap-0.5 lg:flex">
          {items.map((item) => (
            <BarLink key={item.href} item={item} active={isActive(pathname, item)} />
          ))}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1.5 lg:ml-0">
          {profile ? (
            <>
              <span
                className="hidden items-center gap-1.5 rounded-lg bg-warning/10 px-2.5 py-1.5 text-sm font-semibold tabular-nums text-warning sm:inline-flex"
                title={`${profile.streak}-day streak · ${profile.xp} XP · best ${profile.longest_streak}`}
              >
                <Flame className="h-4 w-4" />
                {profile.streak}
              </span>
              <NotificationBell notifications={notifications} />
              <ThemeToggle />
              <AccountMenu profile={profile} />
            </>
          ) : (
            <>
              <ThemeToggle />
              <Link
                href="/login"
                className="hidden h-9 items-center rounded-lg px-3 text-sm font-medium text-muted hover:bg-surface-2 hover:text-foreground sm:inline-flex"
              >
                Sign in
              </Link>
              <Link
                href="/register"
                className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                Get started
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Mobile panel. Inside <header> so it inherits the sticky positioning. */}
      {open && (
        <>
          <nav className={cn("space-y-1 border-t border-border/60 bg-surface py-3 lg:hidden", inner)}>
            {items.map((item) => (
              <PanelLink
                key={item.href}
                item={item}
                active={isActive(pathname, item)}
                onNavigate={() => setOpen(false)}
              />
            ))}
            {/* The streak chip is hidden below sm, so a phone would otherwise
                lose the streak the old sidebar always showed. */}
            {profile && (
              <div className="flex items-center gap-3 border-t border-border/60 px-3 pt-3 text-xs text-muted tabular-nums sm:hidden">
                <span className="inline-flex items-center gap-1">
                  <Flame className="h-3.5 w-3.5 text-warning" /> {profile.streak}-day streak
                </span>
                <span className="inline-flex items-center gap-1">
                  <Zap className="h-3.5 w-3.5 text-primary" /> {profile.xp} XP
                </span>
              </div>
            )}
          </nav>
          {/* Starts below the whole header (bar + panel) so the bar itself is
              not dimmed by its own backdrop. */}
          <div
            className="absolute inset-x-0 top-full h-screen bg-black/40 backdrop-blur-sm lg:hidden"
            onClick={() => setOpen(false)}
          />
        </>
      )}
    </header>
  );
}

function BarLink({ item, active }: { item: NavItem; active: boolean }) {
  const { href, label, icon: Icon, external } = item;
  const cls = cn(
    "group inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-sm font-medium transition-colors xl:px-3",
    active ? "bg-primary/10 text-primary" : "text-muted hover:bg-surface-2 hover:text-foreground",
  );
  const body = (
    <>
      <Icon
        className={cn("h-4 w-4 transition-transform duration-200", !active && "group-hover:scale-110")}
      />
      {label}
    </>
  );
  return external ? (
    <a href={href} target="_blank" rel="noreferrer" className={cls}>
      {body}
    </a>
  ) : (
    <Link href={href} className={cls}>
      {body}
    </Link>
  );
}

function PanelLink({
  item,
  active,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  onNavigate: () => void;
}) {
  const { href, label, icon: Icon, external } = item;
  const cls = cn(
    "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
    active ? "bg-primary/10 text-primary" : "text-muted hover:bg-surface-2 hover:text-foreground",
  );
  const body = (
    <>
      <span
        className={cn(
          "absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary transition-opacity",
          active ? "opacity-100" : "opacity-0",
        )}
      />
      <Icon className="h-4 w-4" />
      {label}
    </>
  );
  return external ? (
    <a href={href} target="_blank" rel="noreferrer" onClick={onNavigate} className={cls}>
      {body}
    </a>
  ) : (
    <Link href={href} onClick={onNavigate} className={cls}>
      {body}
    </Link>
  );
}
