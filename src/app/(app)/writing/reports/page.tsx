import Link from "next/link";
import { ArrowLeft, ChevronRight, ClipboardCheck, PenLine } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { listMyReports, mayUseAiChecks, practiceQuota } from "@/lib/writing-ai";
import { headlineBand } from "@/lib/writing-ai-shared";
import { parseTask2 } from "@/lib/ielts/writing-prompt";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { BandTrend } from "@/components/dashboard/band-trend";
import { MiniRadar } from "@/components/writing/report-charts";
import { TopicChip } from "@/components/writing/topic-chip";
import { UsageMeter } from "@/components/writing/usage-meter";
import { KIND_LABEL } from "@/components/writing/practice-attempt-view";

export const metadata = { title: "My writing reports" };

/** Every AI report this student has been given, newest first. They are kept for good. */
export default async function WritingReportsPage() {
  const profile = await requireProfile();
  const canCheck = mayUseAiChecks(profile);
  const [reports, quota] = await Promise.all([
    listMyReports(profile.id),
    canCheck && profile.role !== "admin" ? practiceQuota(profile) : Promise.resolve(null),
  ]);

  const rows = reports.map(({ check, attempt }) => ({
    check,
    attempt,
    band: headlineBand(check.results),
    at: check.finished_at ?? check.created_at,
  }));
  // Oldest first for the line chart.
  const points = rows
    .filter((r): r is typeof r & { band: number } => r.band != null)
    .map((r) => ({ band: r.band, at: r.at }))
    .reverse();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <ClipboardCheck className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold">My writing reports</h1>
          <p className="text-sm text-muted">
            Every AI check of your writing is saved here. Open one to see your charts, or download it as a PDF.
          </p>
        </div>
        {quota && <UsageMeter quota={quota} />}
        <Link
          href="/writing/history"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface-2"
        >
          <ArrowLeft className="h-4 w-4" /> My practice
        </Link>
      </header>

      {rows.length === 0 ? (
        <EmptyState
          icon={<PenLine />}
          title="No reports yet"
          desc={
            canCheck
              ? "Hand in a practice answer, then press “Check my writing”. Your report will be saved here."
              : "Premium members can have each practice answer checked by AI. Your reports will be saved here."
          }
          action={
            <Link
              href={canCheck ? "/writing/history" : "/premium"}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              {canCheck ? "Go to my practice" : "See Premium"}
            </Link>
          }
        />
      ) : (
        <>
          {points.length >= 2 && <BandTrend points={points} title="Your AI-estimated band over time" />}
          <ul className="space-y-3" data-report-list>
            {rows.map(({ check, attempt, band, at }) => {
              const { statement } = parseTask2(attempt.prompt);
              return (
                <li key={check.id}>
                  <Link href={`/writing/reports/${check.id}`} className="block">
                    <Card interactive className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
                      <MiniRadar results={check.results} />
                      <div className="flex min-w-[4rem] flex-col leading-tight">
                        <span className="text-2xl font-bold tabular-nums">{band == null ? "—" : band.toFixed(1)}</span>
                        <span className="text-xs text-muted">AI estimate</span>
                      </div>
                      <span className="rounded-md bg-surface-2 px-2 py-0.5 text-xs font-semibold text-muted">
                        {KIND_LABEL[attempt.kind]}
                      </span>
                      <TopicChip topic={attempt.topic} />
                      <p className="min-w-[12rem] flex-1 truncate text-sm font-medium">
                        {attempt.kind === "task2" ? statement || attempt.prompt : attempt.prompt}
                      </p>
                      <span className="text-xs text-muted">{new Date(at).toLocaleDateString()}</span>
                      <ChevronRight className="h-4 w-4 text-muted" aria-hidden />
                    </Card>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
