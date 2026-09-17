import Link from "next/link";
import { ArrowRight, CheckCircle2, History, PenLine } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { loadCatalogue } from "@/lib/writing-practice";
import { TOPICS, isTopicId } from "@/lib/writing-practice-topics";
import { parseTask2 } from "@/lib/ielts/writing-prompt";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { TopicChip } from "@/components/writing/topic-chip";

export const metadata = { title: "Writing practice" };

/**
 * The Writing Task 2 practice library. Real questions reported from recent
 * exams, grouped into 15 topics, each one a single sitting a student can do on
 * their own time.
 *
 * This page replaced a "coming soon" stub. It is account-only (/writing is in
 * proxy.ts PROTECTED), so there is no SEO here and the links are plain uuids —
 * the public catalogue's slug question does not arise.
 */
export default async function WritingPracticePage({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string; page?: string }>;
}) {
  const profile = await requireProfile();
  const sp = await searchParams;
  const topic = sp.topic && isTopicId(sp.topic) ? sp.topic : null;
  const page = Number(sp.page) || 1;

  const { entries, counts, total, pages, page: current } = await loadCatalogue(profile.id, { topic, page });
  const anything = Object.values(counts).some((n) => n > 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <PenLine className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold">Writing practice</h1>
          <p className="text-sm text-muted">
            Real IELTS Writing Task 2 questions, on the exam screen. Forty minutes is suggested, not
            enforced — write, hand in, and download your essay as a PDF.
          </p>
        </div>
        <Link
          href="/writing/history"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface-2"
        >
          <History className="h-4 w-4" /> My practice
        </Link>
      </header>

      {!anything ? (
        <EmptyState
          icon={<PenLine />}
          title="No practice questions yet"
          desc="Your teacher is loading them in. They will appear here, sorted by topic."
        />
      ) : (
        <>
          <nav aria-label="Topics" className="flex flex-wrap gap-2">
            <Link
              href="/writing"
              aria-current={!topic ? "page" : undefined}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                !topic ? "border-primary bg-primary/10 text-primary" : "border-border text-muted hover:bg-surface-2"
              }`}
            >
              All <span className="font-normal opacity-70 tabular-nums">{Object.values(counts).reduce((a, b) => a + b, 0)}</span>
            </Link>
            {TOPICS.filter((t) => (counts[t.id] ?? 0) > 0).map((t) => (
              <Link
                key={t.id}
                href={`/writing?topic=${t.id}`}
                aria-current={topic === t.id ? "page" : undefined}
                className={topic === t.id ? "ring-2 ring-offset-1 ring-offset-background rounded-full" : ""}
                style={topic === t.id ? { ["--tw-ring-color" as string]: `var(${t.cssVar})` } : undefined}
              >
                <TopicChip topic={t.id} count={counts[t.id]} />
              </Link>
            ))}
          </nav>

          <p className="text-sm text-muted">
            {total} question{total === 1 ? "" : "s"}
            {topic ? " in this topic" : ""}
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            {entries.map((e) => {
              const { statement, question } = parseTask2(e.prompt);
              return (
                <Card key={e.id} interactive className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-2">
                    <TopicChip topic={e.topic} />
                    {e.submissions > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Done{e.submissions > 1 ? ` ×${e.submissions}` : ""}
                      </span>
                    )}
                  </div>

                  <p className="text-sm leading-relaxed font-medium">{statement || e.prompt}</p>
                  {question && <p className="text-sm leading-relaxed text-muted">{question}</p>}

                  <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                    <span className="text-xs text-muted">
                      {e.appearances > 1 ? `Reported ${e.appearances}× recently` : "Reported recently"}
                    </span>
                    <Link
                      href={`/writing/practice/${e.id}`}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
                    >
                      {e.openAttemptId ? "Continue" : "Start writing"} <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                </Card>
              );
            })}
          </div>

          {pages > 1 && (
            <nav aria-label="Pages" className="flex items-center justify-center gap-2 text-sm">
              {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
                <Link
                  key={n}
                  href={`/writing?${topic ? `topic=${topic}&` : ""}page=${n}`}
                  aria-current={n === current ? "page" : undefined}
                  className={`rounded-lg border px-3 py-1.5 tabular-nums ${
                    n === current ? "border-primary bg-primary/10 font-semibold text-primary" : "border-border hover:bg-surface-2"
                  }`}
                >
                  {n}
                </Link>
              ))}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
