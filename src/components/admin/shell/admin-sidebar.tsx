"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  FileText,
  FileUp,
  PenLine,
  ClipboardCheck,
  Target,
  Flag,
  ShieldCheck,
  ArrowLeft,
  Home,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { BadgeCounts } from "@/lib/admin/stats";
import { AdminSearch } from "./admin-topbar";

type Item = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Count of work waiting on the owner. */
  badge?: number;
  exact?: boolean;
};

// v2.1: sits UNDER the site header (h-16) in the site's warm tokens, with the
// header's own active-link style, so admin reads as part of the same site.
export function AdminSidebar({ isOwner, badges }: { isOwner: boolean; badges: BadgeCounts }) {
  const pathname = usePathname() ?? "";

  const groups: { title?: string; items: Item[] }[] = [
    { items: [{ href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true }] },
    { title: "Students", items: [{ href: "/admin/members", label: "Members", icon: Users }] },
    {
      title: "Content",
      items: [
        { href: "/admin/tests", label: "Tests", icon: FileText },
        ...(isOwner
          ? [{ href: "/admin/converter", label: "PDF converter", icon: FileUp, badge: badges.converter }]
          : []),
        { href: "/admin/writing-practice", label: "Writing practice", icon: PenLine },
      ],
    },
    {
      title: "Exams",
      items: [
        {
          href: "/admin/mocks",
          label: "Mock exams",
          icon: ClipboardCheck,
          badge: badges.requests + badges.grading + badges.release,
        },
        { href: "/admin/discipline", label: "Discipline", icon: Target },
      ],
    },
    {
      title: "Support",
      items: [{ href: "/admin/reports", label: "Problem reports", icon: Flag, badge: badges.reports }],
    },
    ...(isOwner ? [{ title: "Owner", items: [{ href: "/admin/team", label: "Admins", icon: ShieldCheck }] }] : []),
  ];

  const isActive = (it: Item) =>
    it.exact ? pathname === it.href : pathname === it.href || pathname.startsWith(it.href + "/");

  const flat = groups.flatMap((g) => g.items);

  return (
    <>
      {/* Laptop-first (owner's choice); below lg the sidebar folds into a
          scrolling strip under the site header so the panel works on a phone. */}
      <nav
        aria-label="Admin"
        className="glass sticky top-16 z-30 flex gap-1 overflow-x-auto border-b border-border/60 px-3 py-2 lg:hidden"
      >
        {flat.map((it) => {
          const active = isActive(it);
          return (
            <Link
              key={it.href}
              href={it.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium",
                active ? "bg-primary/10 text-primary" : "text-muted hover:bg-surface-2 hover:text-foreground",
              )}
            >
              {it.label}
              {it.badge ? <span className="ml-1 font-semibold text-primary">{it.badge}</span> : null}
            </Link>
          );
        })}
      </nav>

      <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-60 shrink-0 flex-col border-r border-border/60 bg-surface/60 lg:flex">
        <div className="space-y-3 px-3 pb-2 pt-4">
          <div className="flex items-center justify-between px-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Admin panel</p>
            <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
              {isOwner ? "Owner" : "Admin"}
            </span>
          </div>
          <AdminSearch />
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-3" aria-label="Admin">
          {groups.map((g, i) => (
            <div key={g.title ?? i}>
              {g.title && (
                <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted">{g.title}</p>
              )}
              <ul className="space-y-0.5">
                {g.items.map((it) => {
                  const active = isActive(it);
                  const Icon = it.icon;
                  return (
                    <li key={it.href}>
                      <Link
                        href={it.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors",
                          active ? "bg-primary/10 text-primary" : "text-muted hover:bg-surface-2 hover:text-foreground",
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="truncate">{it.label}</span>
                        {it.badge ? (
                          <span
                            className="ml-auto min-w-5 rounded-full bg-primary px-1.5 text-center text-[11px] font-semibold leading-5 text-primary-foreground tabular-nums"
                            aria-label={`${it.badge} waiting`}
                          >
                            {it.badge > 99 ? "99+" : it.badge}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="space-y-0.5 border-t border-border/60 px-3 py-3 text-[13px]">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-muted hover:bg-surface-2 hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Back to my dashboard
          </Link>
          <Link
            href="/"
            className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-muted hover:bg-surface-2 hover:text-foreground"
          >
            <Home className="h-4 w-4" /> Public home page
          </Link>
        </div>
      </aside>
    </>
  );
}
