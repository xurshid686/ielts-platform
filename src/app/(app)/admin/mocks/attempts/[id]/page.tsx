import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpen, Headphones, PenLine } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { getAttemptDetail } from "@/lib/mock";
import { STATUS_LABEL, countWords } from "@/lib/mock-shared";
import { Card } from "@/components/ui/card";
import { ReviewTable } from "@/components/mock/review-table";
import { MockGradeForm } from "@/components/admin/mock-grade-form";

export const metadata = { title: "Mock attempt" };

function when(iso: string | null): string {
  // ISO-style and in Tashkent time: read by the owner, who is in Uzbekistan.
  return iso
    ? new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Tashkent", dateStyle: "medium", timeStyle: "short" })
    : "—";
}

function minutesBetween(a: string | null, b: string | null): string | null {
  if (!a || !b) return null;
  return `${Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60_000)} min`;
}

export default async function AdminMockAttemptPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const detail = await getAttemptDetail(id);
  if (!detail) notFound();
  const { attempt: a, mock } = detail;
  const fmt = (b: number | null) => (b == null ? "—" : b.toFixed(1));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/admin/mocks" className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Mock exams
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-primary">{STATUS_LABEL[a.status]}</p>
          <h1 className="mt-1 text-2xl font-bold">{a.student_name || a.student_email || "Student"}</h1>
          <p className="text-sm text-muted">
            {a.student_email}
            {!a.user_id && " · account deleted (record kept)"} · {mock?.title ?? "(deleted mock)"}
          </p>
        </div>
        <div className="rounded-2xl border border-primary/30 bg-primary/5 px-6 py-3 text-center">
          <p className="text-xs text-muted">Overall</p>
          <p className="text-4xl font-extrabold tabular-nums text-primary">{fmt(a.overall_band)}</p>
        </div>
      </header>

      <Card className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <p><span className="text-muted">Approved:</span> {when(a.approved_at)}</p>
        <p><span className="text-muted">Started:</span> {when(a.started_at)}</p>
        <p><span className="text-muted">Listening in:</span> {when(a.listening_submitted_at)}</p>
        <p><span className="text-muted">Reading in:</span> {when(a.reading_submitted_at)}</p>
        <p>
          <span className="text-muted">Writing in:</span> {when(a.writing_submitted_at)}
          {minutesBetween(a.writing_started_at, a.writing_submitted_at) &&
            ` (${minutesBetween(a.writing_started_at, a.writing_submitted_at)})`}
        </p>
        <p><span className="text-muted">Released:</span> {when(a.released_at)}</p>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat icon={<Headphones className="h-4 w-4" />} label="Listening" band={fmt(a.listening_band)}
          sub={a.listening_raw != null ? `${a.listening_raw}/${a.listening_total}` : "not submitted"} />
        <Stat icon={<BookOpen className="h-4 w-4" />} label="Reading" band={fmt(a.reading_band)}
          sub={a.reading_raw != null ? `${a.reading_raw}/${a.reading_total}` : "not submitted"} />
        <Stat icon={<PenLine className="h-4 w-4" />} label="Writing" band={fmt(a.writing_band)}
          sub={a.writing_submitted_at ? (a.writing_band == null ? "to grade" : "graded") : "not submitted"} />
      </div>

      <Card className="space-y-5">
        <h2 className="font-semibold">Writing</h2>
        {[
          { n: 1, prompt: a.writing_task1_prompt, text: a.writing_task1 },
          { n: 2, prompt: a.writing_task2_prompt, text: a.writing_task2 },
        ].map((t) => (
          <div key={t.n} className="space-y-2">
            <h3 className="flex items-center justify-between text-sm font-medium">
              Task {t.n}
              <span className="text-xs font-normal text-muted">{countWords(t.text)} words</span>
            </h3>
            {t.prompt && <p className="whitespace-pre-wrap text-xs text-muted">{t.prompt}</p>}
            {t.n === 1 && detail.task1ImageUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from private storage
              <img src={detail.task1ImageUrl} alt="Task 1 visual" className="max-h-80 max-w-full rounded-lg border border-border bg-white" />
            )}
            <p className="whitespace-pre-wrap rounded-lg bg-surface-2 p-3 text-sm leading-relaxed">
              {t.text || "(nothing written)"}
            </p>
          </div>
        ))}

        {a.writing_submitted_at ? (
          <div className="border-t border-border pt-5">
            <h3 className="mb-3 font-semibold">Grade and release</h3>
            <MockGradeForm
              attemptId={a.id}
              status={a.status}
              listeningBand={a.listening_band}
              readingBand={a.reading_band}
              initial={{
                task1: a.writing_task1_band,
                task2: a.writing_task2_band,
                writing: a.writing_band,
                feedback: a.writing_feedback,
              }}
            />
          </div>
        ) : (
          <p className="text-sm text-muted">Grading opens once the student submits their writing.</p>
        )}
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">Listening — {detail.listeningTitle ?? "not submitted"}</h2>
        <ReviewTable lines={detail.listeningReview} />
      </Card>
      <Card className="space-y-3">
        <h2 className="font-semibold">Reading — {detail.readingTitle ?? "not submitted"}</h2>
        <ReviewTable lines={detail.readingReview} />
      </Card>
    </div>
  );
}

function Stat({ icon, label, band, sub }: { icon: React.ReactNode; label: string; band: string; sub: string }) {
  return (
    <Card className="text-center">
      <p className="flex items-center justify-center gap-1.5 text-sm text-muted">
        {icon} {label}
      </p>
      <p className="mt-1 text-3xl font-bold tabular-nums">{band}</p>
      <p className="mt-1 text-xs text-muted">{sub}</p>
    </Card>
  );
}
