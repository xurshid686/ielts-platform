import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { getAttemptForAdmin, signedPracticeImage } from "@/lib/writing-practice";
import { TopicChip } from "@/components/writing/topic-chip";
import { KIND_LABEL, PracticeAttemptView, wordsSummary } from "@/components/writing/practice-attempt-view";

export const metadata = { title: "Writing practice · Admin" };

/**
 * One student's practice essay, read-only. There is no grade form on purpose:
 * practice is never marked, so nothing here can write a band anywhere.
 *
 * Like the student's own view, this renders the ATTEMPT's snapshot of the
 * prompt, not the live question.
 */
export default async function AdminPracticeAttemptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const attempt = await getAttemptForAdmin(id);
  if (!attempt) notFound();
  const imageUrl = await signedPracticeImage(attempt.image_path);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center gap-3">
        <Link
          href="/admin/writing-practice?tab=attempts"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface-2"
        >
          <ArrowLeft className="h-4 w-4" /> Practice
        </Link>
        <span className="rounded-md bg-surface-2 px-2 py-0.5 text-xs font-semibold text-muted">
          {KIND_LABEL[attempt.kind]}
        </span>
        <TopicChip topic={attempt.topic} />
        <div>
          <p className="text-sm font-medium">{attempt.student ?? "Deleted account"}</p>
          {attempt.email && <p className="text-xs text-muted">{attempt.email}</p>}
        </div>
        <span className="ml-auto text-sm text-muted">
          {wordsSummary(attempt)} ·{" "}
          {attempt.submitted_at
            ? `submitted ${new Date(attempt.submitted_at).toLocaleString()}`
            : `draft, started ${new Date(attempt.started_at).toLocaleString()}`}
        </span>
      </header>

      <PracticeAttemptView attempt={attempt} imageUrl={imageUrl} answerHeading="The student&rsquo;s answer" />
    </div>
  );
}
