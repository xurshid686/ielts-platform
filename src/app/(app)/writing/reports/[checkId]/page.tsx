import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, Sparkles, Target } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { getMyReport } from "@/lib/writing-ai";
import { signedPracticeImage } from "@/lib/writing-practice";
import { headlineBand, weakestCriterion } from "@/lib/writing-ai-shared";
import { Card } from "@/components/ui/card";
import { AiFeedbackCard } from "@/components/writing/ai-feedback-card";
import { BandGauge, CriteriaRadar, CriteriaTargetBars } from "@/components/writing/report-charts";
import { TopicChip } from "@/components/writing/topic-chip";
import { KIND_LABEL, PracticeAttemptView, wordsSummary } from "@/components/writing/practice-attempt-view";

export const metadata = { title: "Writing report" };

/**
 * One saved AI report. It stays the student's for good: reading and downloading
 * it never needs Premium (only running a new check does), and getMyReport() only
 * returns a check that belongs to the signed-in student — anything else is a 404.
 */
export default async function WritingReportPage({ params }: { params: Promise<{ checkId: string }> }) {
  const { checkId } = await params;
  const profile = await requireProfile();
  const report = await getMyReport(profile.id, checkId);
  if (!report) notFound();

  const { check, attempt } = report;
  const imageUrl = await signedPracticeImage(attempt.image_path);
  const band = headlineBand(check.results);
  const target = profile.target_band ?? null;
  const weakest = weakestCriterion(check.results);
  const when = new Date(check.finished_at ?? check.created_at);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center gap-3">
        <Link
          href="/writing/reports"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface-2"
        >
          <ArrowLeft className="h-4 w-4" /> My reports
        </Link>
        <span className="rounded-md bg-surface-2 px-2 py-0.5 text-xs font-semibold text-muted">{KIND_LABEL[attempt.kind]}</span>
        <TopicChip topic={attempt.topic} />
        <span className="text-sm text-muted">
          {wordsSummary(attempt)} · checked {when.toLocaleDateString(undefined, { dateStyle: "medium" })}
        </span>
        <a
          href={`/api/writing-report/${check.id}`}
          download
          data-report-download
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          <Download className="h-4 w-4" aria-hidden /> Download PDF
        </a>
      </header>

      <Card className="space-y-6 p-6" data-report-summary>
        <div className="flex flex-wrap items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" aria-hidden />
          <h1 className="text-xl font-bold">Your writing report</h1>
          <span className="text-sm text-muted">An AI estimate to guide your practice, not an official IELTS result.</span>
        </div>

        <div className="grid items-center gap-8 md:grid-cols-2">
          <div className="space-y-5">
            <BandGauge band={band} target={target} />
            {check.results.length > 1 && (
              <ul className="flex flex-wrap justify-center gap-2">
                {check.results.map((t) => (
                  <li key={t.task} className="rounded-md bg-surface-2 px-2.5 py-1 text-sm font-semibold tabular-nums">
                    Task {t.task}: {t.overall == null ? "—" : t.overall.toFixed(1)}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <CriteriaRadar results={check.results} target={target} />
        </div>

        <div className="grid gap-8 md:grid-cols-2">
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-muted">Band by criterion</h2>
            <CriteriaTargetBars results={check.results} target={target} />
          </div>
          <div className="space-y-3 text-sm">
            <h2 className="text-sm font-semibold text-muted">Where to focus</h2>
            {weakest ? (
              <p className="flex items-start gap-2">
                <Target className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                <span>
                  Your lowest score is <strong>{weakest.label}</strong> ({weakest.band.toFixed(1)}). Start with the comments and
                  sentence improvements for it below.
                </span>
              </p>
            ) : (
              <p className="text-muted">Your four criteria are level, so work on whichever you find hardest.</p>
            )}
            {target == null && (
              <p className="text-muted">
                Set a target band on your dashboard to see it on these charts.
              </p>
            )}
          </div>
        </div>
      </Card>

      <AiFeedbackCard results={check.results} showBands heading="Feedback in detail" />

      <section className="space-y-3">
        <h2 className="text-lg font-bold">What you wrote</h2>
        <PracticeAttemptView attempt={attempt} imageUrl={imageUrl} answerHeading="Your answer" />
      </section>

      <p className="text-sm text-muted">
        <Link href={`/writing/history/${attempt.id}`} className="font-medium text-primary hover:underline">
          Open this practice attempt
        </Link>
      </p>
    </div>
  );
}
