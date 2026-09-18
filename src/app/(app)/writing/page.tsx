import Link from "next/link";
import { ArrowRight, CheckCircle2, History, PenLine } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { KINDS, isKind, loadCatalogue, type PracticeKind } from "@/lib/writing-practice";
import { CHARTS, TOPICS, isChartId, isTopicId } from "@/lib/writing-practice-topics";
import { parseTask2 } from "@/lib/ielts/writing-prompt";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { TopicChip } from "@/components/writing/topic-chip";

export const metadata = { title: "Writing practice" };

const MENU: Record<PracticeKind, { label: string; blurb: string; empty: string }> = {
  task1: {
    label: "Task 1",
    blurb: "Describe a chart, table, map or process. Twenty minutes is suggested, not enforced.",
    empty: "No Task 1 questions yet — your teacher is adding them.",
  },
  task2: {
    label: "Task 2",
    blurb: "Real Task 2 questions reported from recent exams. Forty minutes is suggested, not enforced.",
    empty: "Your teacher is loading them in. They will appear here, sorted by topic.",
  },
  full: {
    label: "Full test",
    blurb:
      "A whole Writing paper: pick a Task 1 and you get a random Task 2 with it. Sixty minutes is suggested, not enforced.",
    empty: "Full tests need a Task 1 question — your teacher is adding them.",
  },
};

/**
 * The Writing practice library, in three menus (0058): Task 1, Task 2 and the
 * Full test. `kind` lives in the URL; no kind = Task 2, so every pre-0058 link
 * (`/writing?topic=…`) still lands where it did.
 *
 * Account-only (/writing is in proxy.ts PROTECTED), so there is no SEO here and
 * the links are plain uuids.
 */
export default async function WritingPracticePage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; topic?: string; page?: string }>;
}) {
  const profile = await requireProfile();
  const sp = await searchParams;
  const kind: PracticeKind = isKind(sp.kind) ? sp.kind : "task2";
  const task2 = kind === "task2";
  const filter = task2 ? (isTopicId(sp.topic) ? sp.topic : null) : isChartId(sp.topic) ? sp.topic : null;
  const page = Number(sp.page) || 1;

  const { entries, counts, total, pages, page: current } = await loadCatalogue(profile.id, {
    kind,
    topic: filter,
    page,
  });
  const anything = Object.values(counts).some((n) => n > 0);
  const chips = (task2 ? TOPICS : CHARTS).filter((t) => (counts[t.id] ?? 0) > 0);
  const base = `/writing?kind=${kind}`;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <PenLine className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold">Writing practice</h1>
          <p className="text-sm text-muted">
            {MENU[kind].blurb} Write, hand in, and download your work as a PDF.
          </p>
        </div>
        <Link
          href="/writing/history"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface-2"
        >
          <History className="h-4 w-4" /> My practice
        </Link>
      </header>

      <nav aria-label="Writing menus" className="flex gap-1 rounded-xl border border-border bg-surface-2 p-1">
        {KINDS.map((k) => (
          <Link
            key={k}
            href={`/writing?kind=${k}`}
            aria-current={kind === k ? "page" : undefined}
            className={`flex-1 rounded-lg px-3 py-2 text-center text-sm font-semibold ${
              kind === k ? "bg-surface text-primary shadow-sm" : "text-muted hover:text-foreground"
            }`}
          >
            {MENU[k].label}
          </Link>
        ))}
      </nav>

      {!anything ? (
        <EmptyState icon={<PenLine />} title="No practice questions yet" desc={MENU[kind].empty} />
      ) : (
        <>
          {chips.length > 1 && (
            <nav aria-label={task2 ? "Topics" : "Chart types"} className="flex flex-wrap gap-2">
              <Link
                href={base}
                aria-current={!filter ? "page" : undefined}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                  !filter ? "border-primary bg-primary/10 text-primary" : "border-border text-muted hover:bg-surface-2"
                }`}
              >
                All <span className="font-normal opacity-70 tabular-nums">{Object.values(counts).reduce((a, b) => a + b, 0)}</span>
              </Link>
              {chips.map((t) => (
                <Link
                  key={t.id}
                  href={`${base}&topic=${t.id}`}
                  aria-current={filter === t.id ? "page" : undefined}
                  className={filter === t.id ? "ring-2 ring-offset-1 ring-offset-background rounded-full" : ""}
                  style={filter === t.id ? { ["--tw-ring-color" as string]: `var(${t.cssVar})` } : undefined}
                >
                  <TopicChip topic={t.id} count={counts[t.id]} />
                </Link>
              ))}
            </nav>
          )}

          <p className="text-sm text-muted">
            {total} question{total === 1 ? "" : "s"}
            {filter ? (task2 ? " in this topic" : " of this kind") : ""}
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            {entries.map((e) => {
              const chip = task2 ? e.topic : e.chart;
              const { statement, question } = task2 ? parseTask2(e.prompt) : { statement: e.prompt, question: "" };
              return (
                <Card key={e.id} interactive className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <TopicChip topic={chip} />
                      {kind === "full" && <span className="text-xs text-muted">+ a random Task 2</span>}
                    </div>
                    {e.submissions > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Done{e.submissions > 1 ? ` ×${e.submissions}` : ""}
                      </span>
                    )}
                  </div>

                  {e.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from private storage
                    <img
                      src={e.imageUrl}
                      alt="Task 1 picture"
                      loading="lazy"
                      className="block max-h-48 w-full rounded-lg border border-border bg-white object-contain"
                    />
                  )}

                  <p className="text-sm leading-relaxed font-medium">{statement || e.prompt}</p>
                  {question && <p className="text-sm leading-relaxed text-muted">{question}</p>}

                  <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                    <span className="text-xs text-muted">
                      {task2
                        ? e.appearances > 1
                          ? `Reported ${e.appearances}× recently`
                          : "Reported recently"
                        : kind === "full"
                          ? "Task 1 + Task 2 · 60 min"
                          : "Task 1 · 20 min"}
                    </span>
                    <Link
                      href={`/writing/practice/${e.id}?kind=${kind}`}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
                    >
                      {e.openAttemptId ? "Continue" : kind === "full" ? "Start full test" : "Start writing"}{" "}
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                </Card>
              );
            })}
          </div>

          {pages > 1 && (
            <nav aria-label="Pages" className="flex flex-wrap items-center justify-center gap-2 text-sm">
              {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
                <Link
                  key={n}
                  href={`${base}${filter ? `&topic=${filter}` : ""}&page=${n}`}
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
