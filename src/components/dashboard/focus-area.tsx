import Link from "next/link";
import { Target, ArrowRight, Sparkles, BookOpen } from "lucide-react";
import { Card } from "@/components/ui/card";
import { tierForRating } from "@/lib/rating";
import type { TypeStat } from "@/lib/analytics";

export type RecommendedTest = {
  id: string;
  title: string;
  kind: "single" | "full";
  passage: number | null;
  difficulty: number;
};

function barColor(acc: number): string {
  if (acc >= 75) return "bg-success";
  if (acc >= 55) return "bg-warning";
  return "bg-danger";
}

export function FocusArea({
  stats,
  weakest,
  recommended,
}: {
  stats: TypeStat[];
  weakest: TypeStat | null;
  recommended: RecommendedTest[];
}) {
  if (stats.length === 0) {
    return (
      <Card className="flex items-start gap-3">
        <Target className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <p className="text-sm text-muted">
          Take a few reading tests and we&apos;ll show which question types to focus on, plus
          recommend your next test.
        </p>
      </Card>
    );
  }

  const top = stats.slice(0, 6);

  return (
    <section className="grid gap-4 lg:grid-cols-2">
      {/* Question-type breakdown */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium text-muted">Question-type accuracy</h3>
          {weakest && (
            <span className="inline-flex items-center gap-1 rounded-full bg-danger/10 px-2 py-0.5 text-xs font-semibold text-danger">
              <Target className="h-3 w-3" /> Weakest: {weakest.type}
            </span>
          )}
        </div>
        <ul className="space-y-2.5">
          {top.map((s) => (
            <li key={s.type}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="truncate pr-2 font-medium">{s.type}</span>
                <span className="shrink-0 tabular-nums text-muted">
                  {s.accuracy}% · {s.tests} test{s.tests === 1 ? "" : "s"}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                <div
                  className={`h-full rounded-full ${barColor(s.accuracy)}`}
                  style={{ width: `${Math.max(4, s.accuracy)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {/* Recommended next tests */}
      <Card>
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-medium text-muted">
            Recommended next{weakest ? ` · ${weakest.type}` : ""}
          </h3>
        </div>
        {recommended.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            You&apos;ve done every matching test — great work! New ones appear here as they&apos;re
            added.
          </p>
        ) : (
          <ul className="space-y-2">
            {recommended.map((t) => {
              const tier = tierForRating(t.difficulty);
              const label =
                t.kind === "full"
                  ? "Full test"
                  : t.passage
                    ? `Passage ${t.passage}`
                    : "Single passage";
              return (
                <li key={t.id}>
                  <Link
                    href={`/reading/${t.id}`}
                    className="group flex items-center gap-3 rounded-xl border border-border p-3 transition-colors hover:border-primary/40 hover:bg-surface-2/50"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <BookOpen className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{t.title}</span>
                      <span className="text-xs text-muted">
                        {label} · {tier.label} difficulty
                      </span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </section>
  );
}
