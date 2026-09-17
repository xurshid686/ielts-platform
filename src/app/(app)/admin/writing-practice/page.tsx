import Link from "next/link";
import { FileText, PenLine } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { listAttemptsForAdmin, listQuestionsForAdmin } from "@/lib/writing-practice";
import { parseTask2 } from "@/lib/ielts/writing-prompt";
import { TOPICS, isTopicId } from "@/lib/writing-practice-topics";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { TopicChip } from "@/components/writing/topic-chip";
import { PublishToggle } from "@/components/writing/publish-toggle";

export const metadata = { title: "Writing practice · Admin" };

/**
 * The owner's view of Writing Task 2 practice: what is in the library, what is
 * published, and what students have written.
 *
 * There is nothing to grade here — practice is never marked, so this page has
 * no Release, no band and no queue. Questions are loaded by
 * `scripts/import-writing-practice.mjs`, not typed in.
 *
 * `tab` and `topic` live in the URL, like the mock panel's filters.
 */
export default async function AdminWritingPracticePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; topic?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const tab = sp.tab === "attempts" ? "attempts" : "questions";
  const topic = sp.topic && isTopicId(sp.topic) ? sp.topic : null;

  const [questions, attempts] = await Promise.all([
    tab === "questions" ? listQuestionsForAdmin(topic) : Promise.resolve([]),
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
            Task 2 questions students can sit on their own. Not marked, not scored, no anti-cheating
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
          <p className="text-sm text-muted">
            {published} of {questions.length} published
            {topic ? " in this topic" : ""}.
          </p>

          <nav aria-label="Topics" className="flex flex-wrap gap-2">
            <Link
              href="/admin/writing-practice?tab=questions"
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                !topic ? "border-primary bg-primary/10 text-primary" : "border-border text-muted hover:bg-surface-2"
              }`}
            >
              All
            </Link>
            {TOPICS.map((t) => (
              <Link key={t.id} href={`/admin/writing-practice?tab=questions&topic=${t.id}`}>
                <TopicChip topic={t.id} className={topic === t.id ? "ring-2 ring-primary" : ""} />
              </Link>
            ))}
          </nav>

          {questions.length === 0 ? (
            <EmptyState
              icon={<PenLine />}
              title="No questions imported yet"
              desc="Load them with scripts/import-writing-practice.mjs, then publish here."
            />
          ) : (
            <ul className="space-y-3">
              {questions.map((q) => {
                const { statement, question } = parseTask2(q.prompt);
                return (
                  <li key={q.id}>
                    <Card className="flex flex-wrap items-start gap-x-4 gap-y-3 p-4">
                      <TopicChip topic={q.topic} />
                      <div className="min-w-[16rem] flex-1">
                        <p className="text-sm font-medium">{statement || q.prompt}</p>
                        {question && <p className="mt-1 text-sm text-muted">{question}</p>}
                      </div>
                      <span className="text-xs text-muted tabular-nums">
                        {q.appearances}× reported · {q.attempts} attempt{q.attempts === 1 ? "" : "s"}
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
                  <TopicChip topic={a.topic} />
                  <div className="min-w-[12rem] flex-1">
                    <p className="truncate text-sm font-medium">{statement || a.prompt}</p>
                    <p className="text-xs text-muted">
                      {a.student ?? "Deleted account"}
                      {a.email ? ` · ${a.email}` : ""}
                    </p>
                  </div>
                  <span className="text-xs tabular-nums text-muted">{a.word_count} words</span>
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
