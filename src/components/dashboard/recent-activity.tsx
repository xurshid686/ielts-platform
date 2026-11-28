import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { timeAgo } from "@/lib/utils";

// The student's latest attempts, newest first. Reading and Listening rows open the review.
// Shared by Today (a short list) and Progress (the long one).

export type ActivityItem = {
  id: string;
  skill: string;
  title: string | null;
  band: number | null;
  raw: number | null;
  total: number | null;
  at: string;
};

const DOT: Record<string, string> = {
  reading: "bg-skill-reading",
  listening: "bg-skill-listening",
  writing: "bg-skill-writing",
};

export function RecentActivity({
  items,
  total,
  more,
}: {
  items: ActivityItem[];
  total: number;
  /** A "see all" link under the list (Today links to Progress). */
  more?: { href: string; label: string };
}) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center justify-between px-5 py-3.5">
        <h2 className="text-sm font-medium text-muted">Recent activity</h2>
        <span className="text-xs text-muted tabular-nums">{total} total</span>
      </div>
      {items.length === 0 ? (
        <div className="border-t border-border p-5">
          <EmptyState
            icon={<BookOpen />}
            title="No activity yet"
            desc="Your finished tests show up here, newest first."
            className="border-0 bg-transparent py-6"
          />
        </div>
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {items.map((a) => {
            const reviewable = a.skill === "reading" || a.skill === "listening";
            const inner = (
              <>
                <div className="flex min-w-0 items-center gap-3">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[a.skill] ?? "bg-muted"}`} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {a.title ?? <span className="capitalize">{a.skill}</span>}
                    </p>
                    <p className="text-xs text-muted">
                      <span className="capitalize">{a.skill}</span> · {timeAgo(a.at)}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <div className="text-right">
                    {a.band != null && <p className="font-semibold tabular-nums">Band {a.band}</p>}
                    {a.raw != null && a.total != null && (
                      <p className="text-xs text-muted tabular-nums">
                        {a.raw}/{a.total}
                      </p>
                    )}
                  </div>
                  {reviewable && (
                    <span className="hidden items-center gap-1 text-xs font-medium text-primary sm:inline-flex">
                      Review <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  )}
                </div>
              </>
            );
            return (
              <li key={a.id}>
                {reviewable ? (
                  <Link
                    href={`/review/${a.id}`}
                    className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-surface-2/60"
                  >
                    {inner}
                  </Link>
                ) : (
                  <div className="flex items-center justify-between gap-3 px-5 py-3">{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {more && items.length > 0 && (
        <Link
          href={more.href}
          className="flex items-center justify-center gap-1 border-t border-border px-5 py-3 text-sm font-medium text-primary hover:bg-surface-2/60"
        >
          {more.label} <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </Card>
  );
}
