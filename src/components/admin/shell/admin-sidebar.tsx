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
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { BadgeCounts } from "@/lib/admin/stats";

type Item = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  /** Tone of the badge: "work" = waiting on the owner. */
  exact?: boolean;
};

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
        scrolling strip so the panel still works on a phone. */}
    <nav
      aria-label="Admin"
      className="sticky top-0 z-30 flex gap-1 overflow-x-auto border-b px-3 py-2 lg:hidden"
      style={{ background: "var(--side-bg)", color: "var(--side-fg)", borderColor: "var(--side-border)" }}
    >
      {flat.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          aria-current={isActive(it) ? "page" : undefined}
          className="shrink-0 rounded-md px-2.5 py-1 text-xs font-medium"
          style={{ background: isActive(it) ? "var(--side-active)" : undefined, color: isActive(it) ? "#fff" : undefined }}
        >
          {it.label}
          {it.badge ? <span className="ml-1 text-primary">{it.badge}</span> : null}
        </Link>
      ))}
    </nav>
    <aside
      className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r lg:flex"
      style={{ background: "var(--side-bg)", color: "var(--side-fg)", borderColor: "var(--side-border)" }}
    >
      <div className="flex h-14 items-center gap-2 px-5">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
          M
        </span>
        <span className="text-sm font-semibold tracking-tight text-white">MockOnline</span>
        <span
          className="ml-auto rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
          style={{ background: "var(--side-active)", color: "var(--side-muted)" }}
        >
          Admin
        </span>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label="Admin">
        {groups.map((g, i) => (
          <div key={g.title ?? i}>
            {g.title && (
              <p
                className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: "var(--side-muted)" }}
              >
                {g.title}
              </p>
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
                        "group flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] font-medium transition-colors",
                        active ? "text-white" : "hover:text-white",
                      )}
                      style={{ background: active ? "var(--side-active)" : undefined }}
                    >
                      <span
                        className={cn("h-4 w-0.5 rounded-full", active ? "bg-primary" : "bg-transparent")}
                        aria-hidden
                      />
                      <Icon className="h-4 w-4 shrink-0 opacity-80" />
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

      <div className="border-t px-3 py-3" style={{ borderColor: "var(--side-border)" }}>
        <Link
          href="/dashboard"
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Back to site
        </Link>
      </div>
    </aside>
    </>
  );
}
