import Link from "next/link";
import {
  BookOpen,
  Headphones,
  Lock,
  Check,
  Target,
  AlertTriangle,
  RotateCcw,
  PartyPopper,
} from "lucide-react";
import { requireDiscipline } from "@/lib/auth";
import { loadStudentProgress, STRIKE_LIMIT, type StudentTest } from "@/lib/discipline";
import { testPath } from "@/lib/tests/ref";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

export const metadata = { title: "Discipline" };

export default async function DisciplinePage() {
  // Redirects anyone who is not a member. The section is meant to be invisible,
  // not locked — a non-member never learns it exists.
  const { profile, member } = await requireDiscipline();

  // An admin with no membership row is previewing, not competing: every day is
  // open to them so they can check what they have built.
  const preview = !member;
  const progress = await loadStudentProgress(profile.id, member?.reset_at ?? null, preview);
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
                ? "Admin preview — every day is unlocked for you, drafts included."
                : "One day at a time. Finish today's tests to unlock tomorrow."}
            </p>
          </div>
        </div>

        {!preview && progress.totalDays > 0 && (
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-border bg-surface px-4 py-2.5 text-center">
              <p className="text-xs text-muted">Day</p>
              <p className="text-lg font-bold tabular-nums">
                {progress.currentDay}
                <span className="text-sm font-medium text-muted"> of {progress.totalDays}</span>
              </p>
            </div>
            <div
              className={cn(
                "rounded-xl border px-4 py-2.5 text-center",
                strikes > 0 ? "border-danger/30 bg-danger/5" : "border-border bg-surface",
              )}
            >
              <p className="text-xs text-muted">Strikes</p>
              <p className={cn("text-lg font-bold tabular-nums", strikes > 0 && "text-danger")}>
                {strikes}/{STRIKE_LIMIT}
              </p>
            </div>
          </div>
        )}
      </header>

      {!preview && progress.finished && (
        <div className="flex items-start gap-3 rounded-xl border border-success/30 bg-success/5 p-4 text-sm">
          <PartyPopper className="mt-0.5 h-4 w-4 shrink-0 text-success" />
          <p>
            Every day is done. Your teacher will add more — you can re-do any paper in the meantime.
          </p>
        </div>
      )}

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

      {progress.totalDays === 0 ? (
        <EmptyState
          icon={<Target />}
          title="The programme isn't ready yet"
          desc="Your teacher hasn't added any days. Check back soon."
        />
      ) : (
        <ol className="space-y-3">
          {progress.days.map((day) => (
            <li key={day.id}>
              <Card
                className={cn(
                  "space-y-3",
                  day.locked && "opacity-60",
                  !day.locked && !day.complete && "border-primary/35",
                )}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold tabular-nums",
                      day.complete
                        ? "bg-success/15 text-success"
                        : day.locked
                          ? "bg-surface-2 text-muted"
                          : "bg-primary/10 text-primary",
                    )}
                  >
                    {day.complete ? (
                      <Check className="h-4 w-4" />
                    ) : day.locked ? (
                      <Lock className="h-4 w-4" />
                    ) : (
                      day.day_number
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">
                      Day {day.day_number}
                      {day.title ? ` — ${day.title}` : ""}
                      {day.complete && (
                        <span className="ml-2 rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success">
                          Done
                        </span>
                      )}
                      {/* Only ever reachable in admin preview: a student's
                          programme never contains a draft (0047). */}
                      {!day.published && (
                        <span className="ml-2 rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">
                          Draft — students can&rsquo;t see this
                        </span>
                      )}
                    </p>
                    {day.instructions && !day.locked && (
                      <p className="mt-0.5 whitespace-pre-line text-sm text-muted">
                        {day.instructions}
                      </p>
                    )}
                    {day.locked && (
                      <p className="mt-0.5 text-sm text-muted">
                        Finish Day {progress.currentDay} to unlock this.
                      </p>
                    )}
                  </div>
                </div>

                {!day.locked && day.tests.length > 0 && (
                  <ul className="space-y-1.5 pl-12">
                    {day.tests.map((t) => (
                      <TestRow key={t.id} test={t} />
                    ))}
                  </ul>
                )}

                {!day.locked && day.tests.length === 0 && (
                  <p className="pl-12 text-sm text-muted">No tests attached to this day yet.</p>
                )}
              </Card>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/**
 * One paper. Done papers keep their score in view and offer a deliberate Re-do;
 * the link is the same either way — the platform already allows retakes, and
 * saveResult() caps the XP for one. A re-do never changes what the teacher sees,
 * because the progress grid reports the FIRST attempt.
 */
function TestRow({ test }: { test: StudentTest }) {
  const Icon = test.skill === "listening" ? Headphones : BookOpen;
  const href = testPath(test.skill, test);
  const done = test.attempt !== null;

  return (
    <li
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-3 py-2",
        done ? "border-success/25 bg-success/5" : "border-border",
      )}
    >
      <span
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
          done ? "bg-success/15 text-success" : "border border-border text-muted",
        )}
      >
        {done ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
      </span>

      <span className="min-w-0 flex-1 truncate text-sm font-medium">{test.title}</span>

      {done && test.attempt!.raw !== null && (
        <span className="shrink-0 text-sm font-semibold tabular-nums text-success">
          {test.attempt!.raw}/{test.attempt!.total ?? "?"}
        </span>
      )}

      <Link
        href={href}
        className={cn(
          "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
          done
            ? "border border-border bg-surface text-muted hover:text-foreground"
            : "bg-primary text-primary-foreground hover:opacity-90",
        )}
      >
        {done ? (
          <>
            <RotateCcw className="h-3.5 w-3.5" /> Re-do
          </>
        ) : (
          "Start"
        )}
      </Link>
    </li>
  );
}
