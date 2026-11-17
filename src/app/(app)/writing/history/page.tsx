import Link from "next/link";
import { ArrowLeft, ClipboardCheck, FileText, PenLine } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { listMyAttempts } from "@/lib/writing-practice";
import { listMyReports } from "@/lib/writing-ai";
import { headlineBand } from "@/lib/writing-ai-shared";
import { parseTask2 } from "@/lib/ielts/writing-prompt";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { TopicChip } from "@/components/writing/topic-chip";
import { KIND_LABEL, wordsSummary } from "@/components/writing/practice-attempt-view";

export const metadata = { title: "My writing practice" };

/** Everything this student has written here — drafts included, newest first. */
export default async function WritingHistoryPage() {
  const profile = await requireProfile();
  const [attempts, reports] = await Promise.all([listMyAttempts(profile.id), listMyReports(profile.id)]);
  // The newest report per attempt (listMyReports is newest first).
  const aiBand = new Map<string, number | null>();
  for (const r of reports) {
    if (r.check.practice_attempt_id && !aiBand.has(r.check.practice_attempt_id)) {
      aiBand.set(r.check.practice_attempt_id, headlineBand(r.check.results));
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <FileText className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold">My writing practice</h1>
          <p className="text-sm text-muted">
            Everything you have written here — Task 1, Task 2 and full tests. Open one to read it back or download it as a PDF.
          </p>
        </div>
        <Link
          href="/writing/reports"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface-2"
        >
          <ClipboardCheck className="h-4 w-4" /> My reports
        </Link>
        <Link
          href="/writing"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface-2"
        >
          <ArrowLeft className="h-4 w-4" /> Questions
        </Link>
      </header>

      {attempts.length === 0 ? (
        <EmptyState
          icon={<PenLine />}
          title="Nothing written yet"
          desc="Pick a question and write your first answer — it will be saved here."
          action={
            <Link
              href="/writing"
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              Browse questions
            </Link>
          }
        />
      ) : (
        <ul className="space-y-3">
          {attempts.map((a) => {
            const { statement } = parseTask2(a.prompt);
            const href = a.submitted_at
              ? `/writing/history/${a.id}`
              : `/writing/practice/${a.practice_id}?kind=${a.kind}`;
            return (
              <li key={a.id}>
                <Link href={href} className="block">
                  <Card interactive className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
                    <span className="rounded-md bg-surface-2 px-2 py-0.5 text-xs font-semibold text-muted">
                      {KIND_LABEL[a.kind]}
                    </span>
                    <TopicChip topic={a.topic} />
                    <p className="min-w-[14rem] flex-1 truncate text-sm font-medium">
                      {a.kind === "task2" ? statement || a.prompt : a.prompt}
                    </p>
                    <span className="text-xs tabular-nums text-muted">{wordsSummary(a)}</span>
                    <span className="text-xs text-muted">
                      {new Date(a.submitted_at ?? a.started_at).toLocaleDateString()}
                    </span>
                    {aiBand.has(a.id) && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold tabular-nums text-primary" data-ai-chip>
                        AI report · band {aiBand.get(a.id)?.toFixed(1) ?? "—"}
                      </span>
                    )}
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        a.submitted_at ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
                      }`}
                    >
                      {a.submitted_at ? "Submitted" : "Draft"}
                    </span>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
