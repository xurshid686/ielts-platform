import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { getAttemptForAdmin } from "@/lib/writing-practice";
import { WritingPrompt } from "@/components/mock/writing-prompt";
import { Card } from "@/components/ui/card";
import { TopicChip } from "@/components/writing/topic-chip";

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

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center gap-3">
        <Link
          href="/admin/writing-practice?tab=attempts"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface-2"
        >
          <ArrowLeft className="h-4 w-4" /> Practice
        </Link>
        <TopicChip topic={attempt.topic} />
        <div>
          <p className="text-sm font-medium">{attempt.student ?? "Deleted account"}</p>
          {attempt.email && <p className="text-xs text-muted">{attempt.email}</p>}
        </div>
        <span className="ml-auto text-sm text-muted">
          {attempt.word_count} words ·{" "}
          {attempt.submitted_at
            ? `submitted ${new Date(attempt.submitted_at).toLocaleString()}`
            : `draft, started ${new Date(attempt.started_at).toLocaleString()}`}
        </span>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="bg-white p-6">
          <WritingPrompt task={2} raw={attempt.prompt} />
        </Card>
        <Card className="p-6">
          <h2 className="text-sm font-medium text-muted">The student&rsquo;s answer</h2>
          <div className="mt-3 space-y-3 text-[15px] leading-relaxed whitespace-pre-wrap">
            {attempt.answer || <span className="text-muted">Nothing was written.</span>}
          </div>
        </Card>
      </div>
    </div>
  );
}
