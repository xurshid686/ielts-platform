import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, X, CircleSlash, FileQuestion, Crown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PremiumContact } from "@/components/premium-contact";

export type ReviewRow = {
  q: string;
  yours: string | null;
  accepted: string[];
  status: "correct" | "incorrect" | "blank";
};

export function ReviewView({
  title,
  skill,
  band,
  raw,
  total,
  submittedAt,
  rows,
  note,
  subjectName,
  backHref,
  backLabel,
  nextTest,
  showUpgrade = false,
  lockedCount = 0,
}: {
  title: string;
  skill: string;
  band: number | null;
  raw: number | null;
  total: number | null;
  submittedAt: string;
  rows: ReviewRow[];
  note?: string;
  // When an admin reviews another student's attempt, name them and point the
  // back link at that student's attempts list instead of the skill page.
  subjectName?: string;
  backHref?: string;
  backLabel?: string;
  // "What next" block. Only shown to the student who sat the test — an admin
  // looking at someone else's attempt gets neither.
  nextTest?: { id: string; title: string; kind: "single" | "full" } | null;
  showUpgrade?: boolean;
  lockedCount?: number;
}) {
  const accuracy = raw != null && total ? Math.round((raw / total) * 100) : null;
  const correct = rows.filter((r) => r.status === "correct").length;
  const incorrect = rows.filter((r) => r.status === "incorrect").length;
  const blank = rows.filter((r) => r.status === "blank").length;

  const date = new Date(submittedAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={backHref ?? `/${skill}`}
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> {backLabel ?? `Back to ${skill}`}
        </Link>
        {subjectName ? (
          <p className="text-sm font-medium text-primary">{subjectName}’s attempt</p>
        ) : null}
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="text-muted capitalize">
          {skill} review · {date}
        </p>
      </div>

      {/* Score summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="Band" value={band != null ? band.toFixed(1) : "—"} accent />
        <SummaryCard label="Score" value={raw != null && total != null ? `${raw}/${total}` : "—"} />
        <SummaryCard label="Accuracy" value={accuracy != null ? `${accuracy}%` : "—"} />
        <SummaryCard label="Correct" value={`${correct}`} />
      </div>

      {note ? (
        <Card className="flex items-start gap-3 border-warning/30 bg-warning/5">
          <FileQuestion className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
          <p className="text-sm">{note}</p>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap gap-3 text-sm">
            <Legend className="text-success" icon={<Check className="h-4 w-4" />} label={`${correct} correct`} />
            <Legend className="text-danger" icon={<X className="h-4 w-4" />} label={`${incorrect} wrong`} />
            <Legend
              className="text-muted"
              icon={<CircleSlash className="h-4 w-4" />}
              label={`${blank} blank`}
            />
          </div>

          <Card className="overflow-hidden p-0">
            <div className="grid grid-cols-[auto_1fr_1fr] items-center gap-x-4 border-b border-border bg-surface-2/50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted">
              <span>Q</span>
              <span>Your answer</span>
              <span>Correct answer</span>
            </div>
            <ul className="divide-y divide-border">
              {rows.map((r) => (
                <li
                  key={r.q}
                  className="grid grid-cols-[auto_1fr_1fr] items-start gap-x-4 px-4 py-3 text-sm"
                >
                  <span className="flex items-center gap-2 font-semibold tabular-nums">
                    <StatusDot status={r.status} />
                    {r.q}
                  </span>
                  <span
                    className={
                      r.status === "correct"
                        ? "text-success"
                        : r.status === "incorrect"
                          ? "text-danger"
                          : "italic text-muted"
                    }
                  >
                    {r.yours ?? "— blank —"}
                  </span>
                  <span className="text-foreground">{r.accepted.join(" / ") || "—"}</span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}

      {/* What next — the point of maximum motivation, so it carries the only
          upgrade prompt on the page. Hidden when an admin is reviewing
          someone else's attempt. */}
      {!subjectName && (nextTest || showUpgrade) && (
        <div className="grid items-start gap-3 sm:grid-cols-2">
          {nextTest && (
            <Link href={`/${skill}/${nextTest.id}`} className="group">
              <Card className="flex h-full flex-col justify-between transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-elevated">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted">
                    Keep going
                  </p>
                  <p className="mt-1 font-semibold leading-snug">{nextTest.title}</p>
                  <p className="mt-0.5 text-sm text-muted">
                    {nextTest.kind === "full" ? "Full test" : "Single passage"} · not attempted yet
                  </p>
                </div>
                <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary">
                  Start it <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Card>
            </Link>
          )}

          {showUpgrade && (
            <Card className="flex h-full flex-col justify-between border-amber-500/30 bg-amber-500/5">
              <div>
                <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400">
                  <Crown className="h-3.5 w-3.5" /> Premium
                </p>
                <p className="mt-1 font-semibold leading-snug">
                  {lockedCount > 0
                    ? `${lockedCount} more ${skill} tests in the real exam interface`
                    : `Every ${skill} test in the real exam interface`}
                </p>
                <p className="mt-0.5 text-sm text-muted">
                  Full answer review with explanations on every one, and your progress tracked
                  across all of them.
                </p>
              </div>
              <PremiumContact className="mt-3" />
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <Card className={accent ? "bg-primary/5 border-primary/30" : ""}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${accent ? "text-primary" : ""}`}>{value}</p>
    </Card>
  );
}

function Legend({
  icon,
  label,
  className,
}: {
  icon: React.ReactNode;
  label: string;
  className: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 font-medium ${className}`}>
      {icon}
      {label}
    </span>
  );
}

function StatusDot({ status }: { status: ReviewRow["status"] }) {
  if (status === "correct")
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-success/15 text-success">
        <Check className="h-3.5 w-3.5" />
      </span>
    );
  if (status === "incorrect")
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-danger/15 text-danger">
        <X className="h-3.5 w-3.5" />
      </span>
    );
  return (
    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-2 text-muted">
      <CircleSlash className="h-3.5 w-3.5" />
    </span>
  );
}
