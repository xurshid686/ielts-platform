"use client";

import { useState } from "react";
import { Globe, CalendarDays, CalendarRange, Trophy } from "lucide-react";
import { Card } from "@/components/ui/card";
import { RankBadge, TierChip } from "@/components/rating/rank-badge";
import { tierForRating } from "@/lib/rating";
import { cn } from "@/lib/utils";
import type { LeaderboardGlobalRow, LeaderboardPeriodRow } from "@/types/database";

type Tab = "global" | "weekly" | "monthly";

// A normalised row the table can render regardless of board.
type Row = {
  id: string;
  name: string | null;
  avatar_url: string | null;
  rating: number;
  rank: number;
  metric: number; // rating | points
  metricLabel: string; // "rating" | "pts"
  sub: string; // secondary line, e.g. "12 tests"
};

function fromGlobal(r: LeaderboardGlobalRow): Row {
  return {
    id: r.id,
    name: r.name,
    avatar_url: r.avatar_url,
    rating: r.rating,
    rank: r.rank,
    metric: r.rating,
    metricLabel: "rating",
    sub: `${r.tests_completed} test${r.tests_completed === 1 ? "" : "s"}`,
  };
}

function fromPeriod(r: LeaderboardPeriodRow): Row {
  return {
    id: r.id,
    name: r.name,
    avatar_url: r.avatar_url,
    rating: r.rating,
    rank: r.rank,
    metric: r.points,
    metricLabel: "pts",
    sub: `${r.tests} test${r.tests === 1 ? "" : "s"}`,
  };
}

const TABS: { key: Tab; label: string; icon: typeof Globe; blurb: string }[] = [
  { key: "global", label: "Global", icon: Globe, blurb: "All-time rating ranking." },
  { key: "weekly", label: "Weekly", icon: CalendarDays, blurb: "Points earned this week — resets Monday." },
  { key: "monthly", label: "Monthly", icon: CalendarRange, blurb: "Points earned this month — resets on the 1st." },
];

export function Leaderboard({
  meId,
  global,
  weekly,
  monthly,
  meGlobal,
  meWeekly,
  meMonthly,
}: {
  meId: string;
  global: LeaderboardGlobalRow[];
  weekly: LeaderboardPeriodRow[];
  monthly: LeaderboardPeriodRow[];
  meGlobal: LeaderboardGlobalRow | null;
  meWeekly: LeaderboardPeriodRow | null;
  meMonthly: LeaderboardPeriodRow | null;
}) {
  const [tab, setTab] = useState<Tab>("global");

  const data: Record<Tab, { rows: Row[]; me: Row | null }> = {
    global: { rows: global.map(fromGlobal), me: meGlobal ? fromGlobal(meGlobal) : null },
    weekly: { rows: weekly.map(fromPeriod), me: meWeekly ? fromPeriod(meWeekly) : null },
    monthly: { rows: monthly.map(fromPeriod), me: meMonthly ? fromPeriod(meMonthly) : null },
  };

  const { rows, me } = data[tab];
  const blurb = TABS.find((t) => t.key === tab)!.blurb;
  // Only show the sticky "you" row when the user isn't already in the visible list.
  const meInList = me != null && rows.some((r) => r.id === meId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Leaderboard 🏆</h1>
        <p className="text-muted">Compete on reading. Climb the tiers from Bronze to Legend.</p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors",
              tab === key
                ? "bg-primary text-white shadow-soft"
                : "bg-surface-2 text-muted hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      <p className="text-sm text-muted">{blurb}</p>

      {/* Podium for the top 3 */}
      {rows.length >= 3 && <Podium rows={rows.slice(0, 3)} meId={meId} />}

      {/* Table */}
      <Card className="overflow-hidden p-0">
        {rows.length === 0 ? (
          <div className="p-10 text-center text-muted">
            No one&apos;s on this board yet. Complete a reading test to be the first!
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <RowItem key={r.id} row={r} me={r.id === meId} />
            ))}
          </ul>
        )}
      </Card>

      {/* Sticky "your standing" footer when the user is off the visible list */}
      {me && !meInList && (
        <div className="sticky bottom-3 z-10">
          <Card className="border-primary/40 bg-surface/95 p-0 shadow-elevated backdrop-blur">
            <RowItem row={me} me />
          </Card>
        </div>
      )}
      {me == null && (
        <p className="text-center text-sm text-muted">
          You&apos;re not ranked yet — finish a reading test to join the board.
        </p>
      )}
    </div>
  );
}

function RowItem({ row, me }: { row: Row; me: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-3",
        me && "bg-primary/5",
      )}
    >
      <RankCell rank={row.rank} />
      <Avatar name={row.name} url={row.avatar_url} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 truncate text-sm font-medium">
          {row.name || "Anonymous"}
          {me && (
            <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
              YOU
            </span>
          )}
        </p>
        <div className="mt-0.5 flex items-center gap-2">
          <TierChip rating={row.rating} />
          <span className="text-xs text-muted">{row.sub}</span>
        </div>
      </div>
      <div className="text-right">
        <p className="font-bold tabular-nums">{row.metric.toLocaleString()}</p>
        <p className="text-[11px] text-muted">{row.metricLabel}</p>
      </div>
    </div>
  );
}

function RankCell({ rank }: { rank: number }) {
  const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null;
  return (
    <div className="w-8 shrink-0 text-center">
      {medal ? (
        <span className="text-xl">{medal}</span>
      ) : (
        <span className="text-sm font-semibold tabular-nums text-muted">{rank}</span>
      )}
    </div>
  );
}

function Avatar({ name, url }: { name: string | null; url: string | null }) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- external Google avatars; next/image domain config not set up
      <img
        src={url}
        alt=""
        className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-border"
        referrerPolicy="no-referrer"
      />
    );
  }
  const initials = (name || "?")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
      {initials}
    </span>
  );
}

function Podium({ rows, meId }: { rows: Row[]; meId: string }) {
  // Visual order: 2nd, 1st, 3rd.
  const order = [rows[1], rows[0], rows[2]];
  const heights = ["h-20", "h-28", "h-16"];
  return (
    <div className="grid grid-cols-3 items-end gap-3">
      {order.map((r, i) =>
        r ? (
          <div key={r.id} className="flex flex-col items-center">
            <RankBadge rating={r.rating} size={i === 1 ? "lg" : "md"} />
            <p
              className={cn(
                "mt-2 max-w-full truncate text-center text-sm font-semibold",
                r.id === meId && "text-primary",
              )}
            >
              {r.name || "Anonymous"}
            </p>
            <p className="text-xs text-muted">{tierForRating(r.rating).label}</p>
            <div
              className={cn(
                "mt-2 flex w-full flex-col items-center justify-start rounded-t-xl bg-gradient-to-b from-surface-2 to-surface pt-3",
                heights[i],
              )}
            >
              <span className="text-lg">
                {r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : "🥉"}
              </span>
              <span className="mt-1 flex items-center gap-1 text-sm font-bold tabular-nums">
                <Trophy className="h-3.5 w-3.5 text-warning" />
                {r.metric.toLocaleString()}
              </span>
            </div>
          </div>
        ) : (
          <div key={i} />
        ),
      )}
    </div>
  );
}
