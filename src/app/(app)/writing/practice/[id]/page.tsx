import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { openPractice } from "@/lib/writing-practice";
import { PracticeExam } from "@/components/writing/practice-exam";

export const metadata = { title: "Writing practice" };

/**
 * One Task 2 question, being written.
 *
 * Rendering this page RESUMES an unfinished attempt or starts a new one — which
 * is safe to do on a render here precisely because nothing in practice is timed
 * or counted: there is no clock to start early, no reload to record and no
 * violation to trip. (The mock had to split `sectionView` from `beginSection`
 * for exactly those reasons.)
 *
 * The advisory clock runs from the attempt's own `started_at`, so a reload
 * shows the same time left rather than a fresh 40 minutes.
 */
export default async function WritingPracticeSittingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireProfile();

  const opened = await openPractice(profile.id, id);
  if (!opened.ok) redirect("/writing");
  const { attempt } = opened;

  // Already handed in (an old link, or a second tab): the read-only copy is the
  // right place, not a fresh sitting.
  if (attempt.submitted_at) redirect(`/writing/history/${attempt.id}`);

  return (
    <div className="fixed inset-0 z-40 bg-background">
      <PracticeExam
        attemptId={attempt.id}
        topic={attempt.topic}
        prompt={attempt.prompt}
        studentName={profile.name ?? ""}
        initialAnswer={attempt.answer}
        initialRevision={attempt.revision}
        startedAt={attempt.started_at}
      />
    </div>
  );
}
