"use client";

import { useState } from "react";
import Link from "next/link";
import { Globe, CalendarDays, CalendarRange } from "lucide-react";
import { Card } from "@/components/ui/card";
import { TierChip } from "@/components/rating/rank-badge";
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
  // With three or more people the top three stand on the podium and the list
  // continues from fourth place. They used to appear in both.
  const podium = rows.length >= 3 ? rows.slice(0, 3) : [];
  const listed = rows.slice(podium.length);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Leaderboard</h1>
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
      {podium.length > 0 && <Podium rows={podium} meId={meId} metricLabel={rows[0].metricLabel} />}

      {/* Table */}
      <Card className="overflow-hidden p-0">
        {rows.length === 0 ? (
          <div className="p-10 text-center text-muted">
            No one&apos;s on this board yet. Complete a reading test to be the first!
          </div>
        ) : listed.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted">
            Only three people are on this board so far. Finish a reading test to join them.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {listed.map((r) => (
              <li key={r.id}>
                <RowItem row={r} me={r.id === meId} />
              </li>
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
          <Link href={`/u/${row.id}`} className="truncate hover:underline">
            {row.name || "Anonymous"}
          </Link>
          {me && (
            <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-xs font-semibold text-primary">
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
        <p className="text-xs text-muted">{row.metricLabel}</p>
      </div>
    </div>
  );
}

// First, second and third get a filled disc; everyone else a plain number.
const PLACE_STYLE: Record<number, string> = {
  1: "bg-premium text-white",
  2: "bg-muted text-white",
  3: "bg-primary text-primary-foreground",
};

function PlaceDisc({ rank, large = false }: { rank: number; large?: boolean }) {
  return (
    <span
      aria-label={`Place ${rank}`}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-bold tabular-nums",
        large ? "h-7 w-7 text-sm" : "h-6 w-6 text-xs",
        PLACE_STYLE[rank],
      )}
    >
      {rank}
    </span>
  );
}

function RankCell({ rank }: { rank: number }) {
  return (
    <div className="w-8 shrink-0 text-center">
      {rank <= 3 ? (
        <PlaceDisc rank={rank} />
      ) : (
        <span className="text-sm font-semibold tabular-nums text-muted">{rank}</span>
      )}
    </div>
  );
}

function Avatar({
  name,
  url,
  size = "sm",
}: {
  name: string | null;
  url: string | null;
  size?: "sm" | "lg" | "xl";
}) {
  const box = size === "xl" ? "h-20 w-20 text-2xl" : size === "lg" ? "h-14 w-14 text-lg" : "h-9 w-9 text-xs";
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- external Google avatars; next/image domain config not set up
      <img
        src={url}
        alt=""
        className={cn("shrink-0 rounded-full object-cover ring-1 ring-border", box)}
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
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary",
        box,
      )}
    >
      {initials}
    </span>
  );
}

/**
 * The top three, as people: the same avatar the list uses (photo or initials),
 * their name, tier and score. It used to show the tier badge in place of the
 * person, on top of tall empty blocks.
 */
function Podium({ rows, meId, metricLabel }: { rows: Row[]; meId: string; metricLabel: string }) {
  // Visual order: 2nd, 1st, 3rd, with first place raised.
  const order = [rows[1], rows[0], rows[2]];
  return (
    <ol className="grid grid-cols-3 items-end gap-2 sm:gap-4">
      {order.map((r) => {
        const first = r.rank === 1;
        return (
          <li
            key={r.id}
            className={cn(
              "flex min-w-0 flex-col items-center rounded-2xl border bg-surface px-2 py-4 text-center shadow-soft sm:px-4",
              first ? "border-premium/50 pb-6 pt-6 shadow-elevated" : "border-border",
              r.id === meId && "bg-primary/5",
            )}
          >
            <div className="relative">
              <Link href={`/u/${r.id}`} aria-label={r.name || "Anonymous"}>
                <Avatar name={r.name} url={r.avatar_url} size={first ? "xl" : "lg"} />
              </Link>
              <span className="absolute -bottom-1 -right-1 rounded-full ring-2 ring-surface">
                <PlaceDisc rank={r.rank} large={first} />
              </span>
            </div>
            <Link
              href={`/u/${r.id}`}
              className={cn(
                "mt-3 max-w-full truncate text-sm font-semibold hover:underline",
                r.id === meId && "text-primary",
              )}
            >
              {r.name || "Anonymous"}
            </Link>
            <div className="mt-1">
              <TierChip rating={r.rating} />
            </div>
            <p className={cn("mt-2 font-bold tabular-nums", first ? "text-2xl" : "text-lg")}>
              {r.metric.toLocaleString()}
            </p>
            <p className="text-xs text-muted">{metricLabel}</p>
          </li>
        );
      })}
    </ol>
  );
}
