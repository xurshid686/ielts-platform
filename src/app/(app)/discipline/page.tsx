import Link from "next/link";
import { BookOpen, Headphones, Lock, Check, Target, AlertTriangle } from "lucide-react";
import { requireDiscipline } from "@/lib/auth";
import { loadProgramme, loadCompletions, STRIKE_LIMIT } from "@/lib/discipline";
import { testPath } from "@/lib/tests/ref";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

export const metadata = { title: "Discipline" };

export default async function DisciplinePage() {
  // Redirects anyone who is not a member. The section is meant to be invisible,
  // not locked — a non-member never learns it exists.
  const { profile, member } = await requireDiscipline();

  const [programme, done] = await Promise.all([
    loadProgramme(),
    loadCompletions(profile.id),
  ]);

  // An admin with no membership row is previewing, not competing: every day is
  // open to them so they can check what they have built.
  const preview = !member;
  const currentDay = member?.current_day ?? Number.MAX_SAFE_INTEGER;
  const strikes = member?.strikes ?? 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Target className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold">Discipline</h1>
            <p className="text-sm text-muted">
              {preview
                ? "Admin preview — every day is unlocked for you."
                : "One day at a time. Finish today's tests to unlock tomorrow."}
            </p>
          </div>
        </div>

        {!preview && (
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-border bg-surface px-4 py-2.5 text-center">
              <p className="text-xs text-muted">Day</p>
              <p className="text-lg font-bold tabular-nums">{currentDay}</p>
            </div>
            <div
              className={cn(
                "rounded-xl border px-4 py-2.5 text-center",
                strikes > 0 ? "border-danger/30 bg-danger/5" : "border-border bg-surface",
              )}
            >
              <p className="text-xs text-muted">Strikes</p>
              <p
                className={cn(
                  "text-lg font-bold tabular-nums",
                  strikes > 0 && "text-danger",
                )}
              >
                {strikes}/{STRIKE_LIMIT}
              </p>
            </div>
          </div>
        )}
      </header>

      {!preview && strikes > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/5 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          <p>
            {strikes >= STRIKE_LIMIT
              ? `That is ${STRIKE_LIMIT} strikes. Your teacher will reset you to Day 1 — you keep your place in the challenge.`
              : `You have ${strikes} of ${STRIKE_LIMIT} strikes. At ${STRIKE_LIMIT} you go back to Day 1.`}
          </p>
        </div>
      )}

      {programme.length === 0 ? (
        <EmptyState
          icon={<Target />}
          title="The programme isn't ready yet"
          desc="Your teacher hasn't added any days. Check back soon."
        />
      ) : (
        <ol className="space-y-3">
          {programme.map((day) => {
            const complete = done.has(day.id);
            const locked = !preview && !complete && day.day_number > currentDay;
            return (
              <li key={day.id}>
                <Card
                  className={cn(
                    "space-y-3",
                    locked && "opacity-60",
                    !locked && !complete && "border-primary/35",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold tabular-nums",
                        complete
                          ? "bg-success/15 text-success"
                          : locked
                            ? "bg-surface-2 text-muted"
                            : "bg-primary/10 text-primary",
                      )}
                    >
                      {complete ? (
                        <Check className="h-4 w-4" />
                      ) : locked ? (
                        <Lock className="h-4 w-4" />
                      ) : (
                        day.day_number
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">
                        Day {day.day_number}
                        {day.title ? ` — ${day.title}` : ""}
                      </p>
                      {day.instructions && !locked && (
                        <p className="mt-0.5 whitespace-pre-line text-sm text-muted">
                          {day.instructions}
                        </p>
                      )}
                      {locked && (
                        <p className="mt-0.5 text-sm text-muted">
                          Finish Day {currentDay} to unlock this.
                        </p>
                      )}
                    </div>
                  </div>

                  {!locked && day.tests.length > 0 && (
                    <div className="flex flex-wrap gap-2 pl-12">
                      {day.tests.map((t) => (
                        <Link
                          key={t.id}
                          href={testPath(t.skill, t)}
                          className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm font-medium transition-colors hover:border-primary/35 hover:text-primary"
                        >
                          {t.skill === "listening" ? (
                            <Headphones className="h-4 w-4" />
                          ) : (
                            <BookOpen className="h-4 w-4" />
                          )}
                          {t.title}
                        </Link>
                      ))}
                    </div>
                  )}

                  {!locked && day.tests.length === 0 && (
                    <p className="pl-12 text-sm text-muted">No tests attached to this day yet.</p>
                  )}
                </Card>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
