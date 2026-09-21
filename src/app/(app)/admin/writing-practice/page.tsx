import Link from "next/link";
import { FileText, PenLine } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { listAttemptsForAdmin, listQuestionsForAdmin } from "@/lib/writing-practice";
import { parseTask2 } from "@/lib/ielts/writing-prompt";
import { CHARTS, TOPICS, isChartId, isTopicId } from "@/lib/writing-practice-topics";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { TopicChip } from "@/components/writing/topic-chip";
import { PublishToggle } from "@/components/writing/publish-toggle";
import { Task1UploadForm } from "@/components/writing/task1-upload-form";
import { Task2AddForm } from "@/components/writing/task2-add-form";
import { KIND_LABEL, wordsSummary } from "@/components/writing/practice-attempt-view";

export const metadata = { title: "Writing practice · Admin" };

/**
 * The owner's view of Writing practice (Task 1, Task 2, Full): what is in the
 * library, what is published, and what students have written.
 *
 * There is nothing to grade here — practice is never marked, so this page has
 * no Release, no band and no queue. Questions are added one at a time with the
 * "Add Task 1" / "Add Task 2" form on the matching tab, and Task 2 in bulk by
 * `scripts/import-writing-practice.mjs` — both write the same `source_hash`, so
 * a typed question the corpus later reports stays one row. A Full test is not a
 * question of its own — it pairs a Task 1 with a random Task 2 when a student
 * starts it.
 *
 * `tab`, `task` and `topic` live in the URL, like the mock panel's filters.
 */
export default async function AdminWritingPracticePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; task?: string; topic?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const tab = sp.tab === "attempts" ? "attempts" : "questions";
  const task: 1 | 2 = sp.task === "1" ? 1 : 2;
  const topic = task === 2 ? (isTopicId(sp.topic) ? sp.topic : null) : isChartId(sp.topic) ? sp.topic : null;
  const qBase = `/admin/writing-practice?tab=questions&task=${task}`;

  const [questions, attempts] = await Promise.all([
    tab === "questions" ? listQuestionsForAdmin(topic, task) : Promise.resolve([]),
    tab === "attempts" ? listAttemptsForAdmin() : Promise.resolve([]),
  ]);

  const published = questions.filter((q) => q.published).length;

  return (
    <div className="space-y-6">
      <header className="flex items-start gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <PenLine className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-2xl font-bold">Writing practice</h1>
          <p className="text-sm text-muted">
            Task 1 and Task 2 questions students sit on their own, singly or as a full test. Not marked, not scored, no anti-cheating
            — that is the mock exam, which is separate.
          </p>
        </div>
      </header>

      <nav className="flex gap-2 border-b border-border pb-2 text-sm">
        {(["questions", "attempts"] as const).map((t) => (
          <Link
            key={t}
            href={`/admin/writing-practice?tab=${t}`}
            aria-current={tab === t ? "page" : undefined}
            className={`rounded-lg px-3 py-1.5 font-medium capitalize ${
              tab === t ? "bg-primary/10 text-primary" : "text-muted hover:bg-surface-2"
            }`}
          >
            {t}
          </Link>
        ))}
      </nav>

      {tab === "questions" ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {([1, 2] as const).map((t) => (
              <Link
                key={t}
                href={`/admin/writing-practice?tab=questions&task=${t}`}
                aria-current={task === t ? "page" : undefined}
                className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
                  task === t ? "border-primary bg-primary/10 text-primary" : "border-border text-muted hover:bg-surface-2"
                }`}
              >
                Task {t}
              </Link>
            ))}
          </div>

          {task === 1 ? <Task1UploadForm /> : <Task2AddForm />}

          <p className="text-sm text-muted">
            {published} of {questions.length} published
            {topic ? (task === 2 ? " in this topic" : " of this kind") : ""}.
          </p>

          <nav aria-label="Topics" className="flex flex-wrap gap-2">
            <Link
              href={qBase}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                !topic ? "border-primary bg-primary/10 text-primary" : "border-border text-muted hover:bg-surface-2"
              }`}
            >
              All
            </Link>
            {(task === 2 ? TOPICS : CHARTS).map((t) => (
              <Link key={t.id} href={`${qBase}&topic=${t.id}`}>
                <TopicChip topic={t.id} className={topic === t.id ? "ring-2 ring-primary" : ""} />
              </Link>
            ))}
          </nav>

          {questions.length === 0 ? (
            <EmptyState
              icon={<PenLine />}
              title={task === 2 ? "No questions imported yet" : "No Task 1 questions yet"}
              desc={
                task === 2
                  ? "Add one with the form above or load the corpus with scripts/import-writing-practice.mjs, then publish here."
                  : "Add one with the form above, then publish it here."
              }
            />
          ) : (
            <ul className="space-y-3">
              {questions.map((q) => {
                const { statement, question } =
                  task === 2 ? parseTask2(q.prompt) : { statement: q.prompt, question: "" };
                return (
                  <li key={q.id}>
                    <Card className="flex flex-wrap items-start gap-x-4 gap-y-3 p-4">
                      <TopicChip topic={task === 2 ? q.topic : q.chart} />
                      {q.imageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from private storage
                        <img
                          src={q.imageUrl}
                          alt="Task 1 picture"
                          className="h-24 w-40 rounded border border-border bg-white object-contain"
                        />
                      )}
                      <div className="min-w-[16rem] flex-1">
                        <p className="text-sm font-medium">{statement || q.prompt}</p>
                        {question && <p className="mt-1 text-sm text-muted">{question}</p>}
                      </div>
                      <span className="text-xs text-muted tabular-nums">
                        {task === 2 ? `${q.appearances}× reported · ` : ""}
                        {q.attempts} attempt{q.attempts === 1 ? "" : "s"}
                      </span>
                      <PublishToggle id={q.id} published={q.published} />
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      ) : attempts.length === 0 ? (
        <EmptyState icon={<FileText />} title="Nothing written yet" desc="Students' practice essays appear here." />
      ) : (
        <ul className="space-y-3">
          {attempts.map((a) => {
            const { statement } = parseTask2(a.prompt);
            return (
              <li key={a.id}>
                <Card className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
                  <span className="rounded-md bg-surface-2 px-2 py-0.5 text-xs font-semibold text-muted">
                    {KIND_LABEL[a.kind]}
                  </span>
                  <TopicChip topic={a.topic} />
                  <div className="min-w-[12rem] flex-1">
                    <p className="truncate text-sm font-medium">
                      {a.kind === "task2" ? statement || a.prompt : a.prompt}
                    </p>
                    <p className="text-xs text-muted">
                      {a.student ?? "Deleted account"}
                      {a.email ? ` · ${a.email}` : ""}
                    </p>
                  </div>
                  <span className="text-xs tabular-nums text-muted">{wordsSummary(a)}</span>
                  <span className="text-xs text-muted">
                    {new Date(a.submitted_at ?? a.started_at).toLocaleString()}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      a.submitted_at ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
                    }`}
                  >
                    {a.submitted_at ? "Submitted" : "Draft"}
                  </span>
                  <Link
                    href={`/admin/writing-practice/attempts/${a.id}`}
                    className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-2"
                  >
                    Read
                  </Link>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
