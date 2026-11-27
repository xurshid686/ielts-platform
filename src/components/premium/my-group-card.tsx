import Link from "next/link";
import { Users, ArrowRight } from "lucide-react";
import type { FriendsGroup } from "@/lib/friends";

/** Dashboard card for a Friends group member (0077): who practised most this week. */
export function MyGroupCard({ group, me }: { group: FriendsGroup; me: string }) {
  const ranked = [...group.members].sort((a, b) => b.tests_week - a.tests_week);
  const free = group.seats - group.members.length;
  const isOrganiser = group.owner_id === me;
  return (
    <section
      aria-label="My Friends group"
      className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-surface px-5 py-4 shadow-soft"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-premium/15 text-premium">
        <Users className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Friends group · this week</p>
        <p className="mt-0.5 truncate text-sm text-muted">
          {ranked.map((m) => `${m.id === me ? "You" : m.name.split(/\s+/)[0]} ${m.tests_week}`).join(" · ")}
          {isOrganiser && free > 0 ? ` · ${free} free ${free === 1 ? "seat" : "seats"}` : ""}
        </p>
      </div>
      <Link href="/premium/group" className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
        {isOrganiser && free > 0 ? "Invite friends" : "Open group"} <ArrowRight className="h-4 w-4" />
      </Link>
    </section>
  );
}
