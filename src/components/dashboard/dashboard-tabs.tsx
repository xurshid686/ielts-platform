import Link from "next/link";

// "Today · Progress": the two halves of the student dashboard.
export function DashboardTabs({ active }: { active: "today" | "progress" }) {
  const tab = (key: "today" | "progress", href: string, label: string) => (
    <Link
      href={href}
      aria-current={active === key ? "page" : undefined}
      className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors ${
        active === key ? "bg-surface text-foreground shadow-soft" : "text-muted hover:text-foreground"
      }`}
    >
      {label}
    </Link>
  );
  return (
    <nav aria-label="Dashboard" className="inline-flex rounded-xl border border-border bg-surface-2/70 p-1">
      {tab("today", "/dashboard", "Today")}
      {tab("progress", "/dashboard/progress", "Progress")}
    </nav>
  );
}
