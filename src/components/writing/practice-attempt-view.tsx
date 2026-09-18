import { WritingPrompt } from "@/components/mock/writing-prompt";
import { Card } from "@/components/ui/card";
import { TopicChip } from "@/components/writing/topic-chip";
import type { AttemptRow } from "@/lib/writing-practice";

/**
 * A practice attempt, read-only: each task's prompt beside what was written.
 * Shared by the student's history page and the admin attempt page, so the two
 * cannot drift. Renders the ATTEMPT's snapshot, never the live question.
 */
export function PracticeAttemptView({
  attempt,
  imageUrl,
  answerHeading,
}: {
  attempt: AttemptRow;
  imageUrl: string | null;
  answerHeading: string;
}) {
  const tasks =
    attempt.kind === "full"
      ? [
          { task: 1 as const, prompt: attempt.prompt, answer: attempt.answer, words: attempt.word_count, chip: attempt.topic },
          { task: 2 as const, prompt: attempt.prompt2 ?? "", answer: attempt.answer2, words: attempt.word_count2, chip: attempt.topic2 },
        ]
      : [
          {
            task: attempt.kind === "task1" ? (1 as const) : (2 as const),
            prompt: attempt.prompt,
            answer: attempt.answer,
            words: attempt.word_count,
            chip: attempt.topic,
          },
        ];

  return (
    <div className="space-y-8">
      {tasks.map((t) => (
        <section key={t.task} className="space-y-3">
          {attempt.kind === "full" && (
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold">Task {t.task}</h2>
              <TopicChip topic={t.chip} />
              <span className="text-sm text-muted tabular-nums">{t.words} words</span>
            </div>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="bg-white p-6">
              <WritingPrompt task={t.task} raw={t.prompt} imageUrl={t.task === 1 ? imageUrl : null} />
            </Card>
            <Card className="p-6">
              <h3 className="text-sm font-medium text-muted">{answerHeading}</h3>
              <div className="mt-3 space-y-3 text-[15px] leading-relaxed whitespace-pre-wrap">
                {t.answer || <span className="text-muted">Nothing was written.</span>}
              </div>
            </Card>
          </div>
        </section>
      ))}
    </div>
  );
}

export const KIND_LABEL: Record<string, string> = { task1: "Task 1", task2: "Task 2", full: "Full test" };

/** One line of words for a list row: "212 words" or "T1 160 · T2 270 words". */
export function wordsSummary(a: Pick<AttemptRow, "kind" | "word_count" | "word_count2">): string {
  return a.kind === "full" ? `T1 ${a.word_count} · T2 ${a.word_count2} words` : `${a.word_count} words`;
}
