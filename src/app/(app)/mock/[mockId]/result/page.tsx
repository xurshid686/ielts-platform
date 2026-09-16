import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, BookOpen, Headphones, PenLine } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { getReleasedDetail } from "@/lib/mock";
import { Card } from "@/components/ui/card";
import { ReviewTable } from "@/components/mock/review-table";
import { ReportDownloads } from "@/components/mock/report-downloads";

export const metadata = { title: "Mock result" };

// A static segment beats the dynamic [section] sibling, so /mock/[id]/result
// always lands here. Renders ONLY a released attempt; anything else goes back
// to the overview, which shows the student where they are.
export default async function MockResultPage({ params }: { params: Promise<{ mockId: string }> }) {
  const { mockId } = await params;
  const profile = await requireProfile();
  const detail = await getReleasedDetail(profile.id, mockId);
  if (!detail) redirect(`/mock/${mockId}`);

  const { attempt: a, mock } = detail;
  const fmt = (b: number | null) => (b == null ? "—" : b.toFixed(1));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/mock" className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> All mocks
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-success">Result released</p>
          <h1 className="mt-1 text-2xl font-bold">{mock?.title ?? "Mock exam"}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ReportDownloads attemptId={a.id} />
        </div>
        <div className="rounded-2xl border border-primary/30 bg-primary/5 px-6 py-3 text-center">
          <p className="text-xs text-muted">Overall band</p>
          <p className="text-4xl font-extrabold tabular-nums text-primary">{fmt(a.overall_band)}</p>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Band icon={<Headphones className="h-4 w-4" />} label="Listening" band={fmt(a.listening_band)}
          sub={a.listening_raw != null ? `${a.listening_raw}/${a.listening_total} correct` : null} />
        <Band icon={<BookOpen className="h-4 w-4" />} label="Reading" band={fmt(a.reading_band)}
          sub={a.reading_raw != null ? `${a.reading_raw}/${a.reading_total} correct` : null} />
        <Band icon={<PenLine className="h-4 w-4" />} label="Writing" band={fmt(a.writing_band)}
          sub={`Task 1: ${fmt(a.writing_task1_band)} · Task 2: ${fmt(a.writing_task2_band)}`} />
      </div>

      {a.writing_feedback && (
        <Card className="space-y-2">
          <h2 className="font-semibold">Writing feedback</h2>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{a.writing_feedback}</p>
        </Card>
      )}

      {/* The papers, reopened read-only (2026-09-16): their own answers, marked,
          with the correct answers and the paper's explanations. */}
      <Card className="space-y-3">
        <h2 className="font-semibold">Your papers</h2>
        <p className="text-sm text-muted">
          Open the paper you sat to see your answers in place, marked, with the correct answers. Nothing can be
          changed, and the Listening recording plays as often as you like.
        </p>
        <div className="flex flex-wrap gap-2">
          {a.listening_submitted_at && (
            <Link
              href={`/mock/${mockId}/review/listening`}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface-2"
            >
              <Headphones className="h-4 w-4" /> Listening paper
            </Link>
          )}
          {a.reading_submitted_at && (
            <Link
              href={`/mock/${mockId}/review/reading`}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface-2"
            >
              <BookOpen className="h-4 w-4" /> Reading paper
            </Link>
          )}
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">Listening answers</h2>
        <ReviewTable lines={detail.listeningReview} />
      </Card>
      <Card className="space-y-3">
        <h2 className="font-semibold">Reading answers</h2>
        <ReviewTable lines={detail.readingReview} />
      </Card>

      <Card className="space-y-4">
        <h2 className="font-semibold">Your writing</h2>
        {[
          { n: 1, prompt: a.writing_task1_prompt, text: a.writing_task1 },
          { n: 2, prompt: a.writing_task2_prompt, text: a.writing_task2 },
        ].map((t) => (
          <div key={t.n} className="space-y-1.5">
            <h3 className="text-sm font-medium">Task {t.n}</h3>
            {t.prompt && <p className="whitespace-pre-wrap text-xs text-muted">{t.prompt}</p>}
            <p className="whitespace-pre-wrap rounded-lg bg-surface-2 p-3 text-sm leading-relaxed">
              {t.text || "(nothing written)"}
            </p>
          </div>
        ))}
      </Card>
    </div>
  );
}

function Band({ icon, label, band, sub }: { icon: React.ReactNode; label: string; band: string; sub: string | null }) {
  return (
    <Card className="text-center">
      <p className="flex items-center justify-center gap-1.5 text-sm text-muted">
        {icon} {label}
      </p>
      <p className="mt-1 text-3xl font-bold tabular-nums">{band}</p>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </Card>
  );
}
