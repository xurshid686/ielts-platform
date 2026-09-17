import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { getMyAttempt } from "@/lib/writing-practice";
import { WritingPrompt } from "@/components/mock/writing-prompt";
import { Card } from "@/components/ui/card";
import { TopicChip } from "@/components/writing/topic-chip";
import { PracticePdfButton } from "@/components/writing/practice-pdf-button";

export const metadata = { title: "Writing practice" };

/**
 * A submitted practice, read-only.
 *
 * Everything on this page comes from the ATTEMPT's own snapshot of the prompt
 * and topic, never from the live question — editing or unpublishing a question
 * must not rewrite what a student was actually asked.
 */
export default async function WritingPracticeAttemptPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const { attemptId } = await params;
  const profile = await requireProfile();

  const attempt = await getMyAttempt(profile.id, attemptId);
  if (!attempt) notFound();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center gap-3">
        <Link
          href="/writing/history"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface-2"
        >
          <ArrowLeft className="h-4 w-4" /> My practice
        </Link>
        <TopicChip topic={attempt.topic} />
        <span className="text-sm text-muted">
          {attempt.word_count} words ·{" "}
          {attempt.submitted_at
            ? `submitted ${new Date(attempt.submitted_at).toLocaleString()}`
            : "draft"}
        </span>
        <div className="ml-auto">
          <PracticePdfButton
            studentName={profile.name ?? ""}
            topic={attempt.topic}
            prompt={attempt.prompt}
            answer={attempt.answer}
            words={attempt.word_count}
            submittedAt={attempt.submitted_at}
          />
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="bg-white p-6">
          <WritingPrompt task={2} raw={attempt.prompt} />
        </Card>
        <Card className="p-6">
          <h2 className="text-sm font-medium text-muted">Your answer</h2>
          <div className="mt-3 space-y-3 text-[15px] leading-relaxed whitespace-pre-wrap">
            {attempt.answer || <span className="text-muted">Nothing was written.</span>}
          </div>
        </Card>
      </div>

      <p className="text-sm text-muted">
        Practice is not marked here — this is your own copy to keep or to show a teacher.
      </p>
    </div>
  );
}
