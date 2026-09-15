import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpen, ChevronLeft, ChevronRight, Headphones, PenLine } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { getAttemptDetail } from "@/lib/mock";
import { gradingQueue } from "@/lib/mock-admin";
import { STAGE_LABEL, adminStage, countWords, tashkent } from "@/lib/mock-shared";
import { Card } from "@/components/ui/card";
import { ReviewTable } from "@/components/mock/review-table";
import { MockGradeForm } from "@/components/admin/mock-grade-form";

export const metadata = { title: "Mock attempt" };

function minutesBetween(a: string | null, b: string | null): string | null {
  if (!a || !b) return null;
  return `${Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60_000)} min`;
}

/** Only a query string for our own admin page may come back through `back`. */
function safeBack(raw: string | undefined): string {
  if (!raw || raw.length > 500 || /[\r\n]/.test(raw)) return "";
  try {
    return new URLSearchParams(raw).toString();
  } catch {
    return "";
  }
}

export default async function AdminMockAttemptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ back?: string }>;
}) {
  await requireAdmin();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const detail = await getAttemptDetail(id);
  if (!detail) notFound();
  const { attempt: a, mock } = detail;

  const back = safeBack(sp.back);
  const backHref = `/admin/mocks${back ? `?${back}` : ""}`;
  const withBack = (attemptId: string) =>
    `/admin/mocks/attempts/${attemptId}${back ? `?back=${encodeURIComponent(back)}` : ""}`;

  const queue = await gradingQueue(a.id, a.mock_id);
  const stage = adminStage(a);
  const fmt = (b: number | null) => (b == null ? "—" : b.toFixed(1));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={backHref} className="inline-flex h-10 items-center gap-1 text-sm text-muted hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to results
        </Link>

        {/* Grading queue for this mock: oldest submission first. */}
        {queue.total > 0 && (
          <div className="flex items-center gap-1 text-sm">
            {queue.prevId && (
              <Link href={withBack(queue.prevId)} className="inline-flex h-10 items-center rounded-lg border border-border px-2 hover:bg-surface-2" aria-label="Previous to grade">
                <ChevronLeft className="h-4 w-4" />
              </Link>
            )}
            <span className="px-2 text-muted">
              {queue.position ? `${queue.position} of ${queue.total} to grade` : `${queue.total} to grade in this mock`}
            </span>
            {queue.nextId && (
              <Link href={withBack(queue.nextId)} className="inline-flex h-10 items-center rounded-lg border border-border px-2 hover:bg-surface-2" aria-label="Next to grade">
                <ChevronRight className="h-4 w-4" />
              </Link>
            )}
          </div>
        )}
      </div>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-primary">{STAGE_LABEL[stage]}</p>
          <h1 className="mt-1 text-2xl font-bold">{a.student_name || a.student_email || "Student"}</h1>
          <p className="break-all text-sm text-muted">
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
        <p><span className="text-muted">Approved:</span> {tashkent(a.approved_at)}</p>
        <p><span className="text-muted">Started:</span> {tashkent(a.started_at)}</p>
        <p><span className="text-muted">Listening in:</span> {tashkent(a.listening_submitted_at)}</p>
        <p><span className="text-muted">Reading in:</span> {tashkent(a.reading_submitted_at)}</p>
        <p>
          <span className="text-muted">Writing in:</span> {tashkent(a.writing_submitted_at)}
          {minutesBetween(a.writing_started_at, a.writing_submitted_at) &&
            ` (${minutesBetween(a.writing_started_at, a.writing_submitted_at)} of ${a.writing_minutes ?? mock?.writing_minutes ?? 60})`}
        </p>
        <p><span className="text-muted">Released:</span> {tashkent(a.released_at)}</p>
        <p className="text-xs text-muted sm:col-span-2">Times in Tashkent.</p>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat icon={<Headphones className="h-4 w-4" />} label="Listening" band={fmt(a.listening_band)}
          sub={a.listening_raw != null ? `${a.listening_raw}/${a.listening_total}` : "not submitted"} href="#listening" />
        <Stat icon={<BookOpen className="h-4 w-4" />} label="Reading" band={fmt(a.reading_band)}
          sub={a.reading_raw != null ? `${a.reading_raw}/${a.reading_total}` : "not submitted"} href="#reading" />
        <Stat icon={<PenLine className="h-4 w-4" />} label="Writing" band={fmt(a.writing_band)}
          sub={a.writing_submitted_at ? (a.writing_band == null ? "to grade" : "graded") : "not submitted"} href="#writing" />
      </div>

      <Card id="writing" className="scroll-mt-20 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Writing</h2>
          <nav className="flex gap-1 text-sm" aria-label="Jump to task">
            <a href="#task-1" className="rounded-lg px-3 py-2 text-primary hover:bg-surface-2">Task 1</a>
            <a href="#task-2" className="rounded-lg px-3 py-2 text-primary hover:bg-surface-2">Task 2</a>
            {a.writing_submitted_at && <a href="#grade" className="rounded-lg px-3 py-2 text-primary hover:bg-surface-2">Grade</a>}
          </nav>
        </div>
        {[
          { n: 1, prompt: a.writing_task1_prompt, text: a.writing_task1 },
          { n: 2, prompt: a.writing_task2_prompt, text: a.writing_task2 },
        ].map((t) => (
          <div key={t.n} id={`task-${t.n}`} className="scroll-mt-20 space-y-2">
            <h3 className="flex items-center justify-between text-sm font-medium">
              Task {t.n}
              <span className="text-xs font-normal text-muted">{countWords(t.text)} words</span>
            </h3>
            {t.prompt && <p className="whitespace-pre-wrap text-xs text-muted">{t.prompt}</p>}
            {t.n === 1 && detail.task1ImageUrl && (
              <a href={detail.task1ImageUrl} target="_blank" rel="noreferrer" title="Open full size">
                {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from private storage */}
                <img src={detail.task1ImageUrl} alt="Task 1 visual" className="max-h-80 max-w-full rounded-lg border border-border bg-white" />
              </a>
            )}
            <p className="whitespace-pre-wrap rounded-lg bg-surface-2 p-3 text-sm leading-relaxed">
              {t.text || "(nothing written)"}
            </p>
          </div>
        ))}

        {a.writing_submitted_at ? (
          <div id="grade" className="scroll-mt-20 border-t border-border pt-5">
            <h3 className="mb-3 font-semibold">Grade and release</h3>
            <MockGradeForm
              key={`${a.id}-${a.graded_at ?? ""}-${a.status}`}
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
              nextHref={queue.nextId && queue.nextId !== a.id ? withBack(queue.nextId) : null}
            />
          </div>
        ) : (
          <p className="text-sm text-muted">Grading opens once the student submits their writing.</p>
        )}
      </Card>

      <Card id="listening" className="scroll-mt-20 space-y-3">
        <h2 className="font-semibold">Listening — {detail.listeningTitle ?? "not submitted"}</h2>
        <ReviewTable lines={detail.listeningReview} />
      </Card>
      <Card id="reading" className="scroll-mt-20 space-y-3">
        <h2 className="font-semibold">Reading — {detail.readingTitle ?? "not submitted"}</h2>
        <ReviewTable lines={detail.readingReview} />
      </Card>
    </div>
  );
}

function Stat({ icon, label, band, sub, href }: { icon: React.ReactNode; label: string; band: string; sub: string; href: string }) {
  return (
    <a href={href} className="block rounded-2xl border border-border bg-surface p-5 text-center shadow-soft hover:border-primary/35">
      <p className="flex items-center justify-center gap-1.5 text-sm text-muted">
        {icon} {label}
      </p>
      <p className="mt-1 text-3xl font-bold tabular-nums">{band}</p>
      <p className="mt-1 text-xs text-muted">{sub}</p>
    </a>
  );
}
