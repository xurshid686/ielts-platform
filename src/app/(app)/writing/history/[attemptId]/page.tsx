import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { getMyAttempt, signedPracticeImage } from "@/lib/writing-practice";
import { TopicChip } from "@/components/writing/topic-chip";
import { PracticePdfButton } from "@/components/writing/practice-pdf-button";
import { KIND_LABEL, PracticeAttemptView, wordsSummary } from "@/components/writing/practice-attempt-view";

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
  const imageUrl = await signedPracticeImage(attempt.image_path);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center gap-3">
        <Link
          href="/writing/history"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface-2"
        >
          <ArrowLeft className="h-4 w-4" /> My practice
        </Link>
        <span className="rounded-md bg-surface-2 px-2 py-0.5 text-xs font-semibold text-muted">
          {KIND_LABEL[attempt.kind]}
        </span>
        <TopicChip topic={attempt.topic} />
        <span className="text-sm text-muted">
          {wordsSummary(attempt)} ·{" "}
          {attempt.submitted_at
            ? `submitted ${new Date(attempt.submitted_at).toLocaleString()}`
            : "draft"}
        </span>
        <div className="ml-auto">
          <PracticePdfButton
            studentName={profile.name ?? ""}
            kind={attempt.kind}
            topic={attempt.topic}
            prompt={attempt.prompt}
            imageUrl={imageUrl}
            answer={attempt.answer}
            prompt2={attempt.prompt2}
            topic2={attempt.topic2}
            answer2={attempt.answer2}
            submittedAt={attempt.submitted_at}
          />
        </div>
      </header>

      <PracticeAttemptView attempt={attempt} imageUrl={imageUrl} answerHeading="Your answer" />

      <p className="text-sm text-muted">
        Practice is not marked here — this is your own copy to keep or to show a teacher.
      </p>
    </div>
  );
}
