import Link from "next/link";
import { Users, ArrowRight } from "lucide-react";
import type { FriendsGroup } from "@/lib/friends";

/** Dashboard card for a Friends group member: name, this week's ranking, the goal. */
export function MyGroupCard({ group, me }: { group: FriendsGroup; me: string }) {
  const ranked = [...group.members].sort((a, b) => b.points_week - a.points_week || b.tests_week - a.tests_week);
  const free = group.seats - group.members.length - group.pending.length;
  const isBuyer = group.owner_id === me;
  const g = group.goal;
  const pct = g.target > 0 ? Math.min(100, Math.round((g.done / g.target) * 100)) : 0;
  return (
    <section
      aria-label="My Friends group"
      className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-surface px-5 py-4 shadow-soft"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-premium/15 text-premium">
        <Users className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{group.name} · this week</p>
        <p className="mt-0.5 truncate text-sm text-muted">
          {ranked.map((m) => `${m.id === me ? "You" : m.name.split(/\s+/)[0]} ${m.points_week} pts`).join(" · ")}
        </p>
        {group.members.length >= 2 && (
          <div className="mt-2 flex items-center gap-2 text-xs text-muted">
            <div className="h-1.5 w-32 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full bg-premium-gradient" style={{ width: `${pct}%` }} />
            </div>
            {g.reached ? "Goal reached, +100 XP!" : `Goal ${Math.min(g.done, g.target)}/${g.target} tests`}
          </div>
        )}
      </div>
      <Link href="/premium/group" className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
        {isBuyer && free > 0 ? "Invite friends" : "Open group"} <ArrowRight className="h-4 w-4" />
      </Link>
    </section>
  );
}
