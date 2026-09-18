import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { isKind, openPractice, signedPracticeImage } from "@/lib/writing-practice";
import { PracticeExam } from "@/components/writing/practice-exam";

export const metadata = { title: "Writing practice" };

/**
 * One practice sitting being written: a Task 1, a Task 2, or a Full test
 * (`?kind=task1|task2|full`; no kind = task2, so pre-0058 links still work).
 *
 * Rendering this page RESUMES an unfinished attempt or starts a new one — which
 * is safe to do on a render here precisely because nothing in practice is timed
 * or counted: there is no clock to start early, no reload to record and no
 * violation to trip. (The mock had to split `sectionView` from `beginSection`
 * for exactly those reasons.) For a Full test, starting is also when the random
 * Task 2 is picked, and a reload resumes the same pair.
 *
 * The advisory clock runs from the attempt's own `started_at`, so a reload
 * shows the same time left rather than a fresh allowance.
 */
export default async function WritingPracticeSittingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ kind?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const kind = isKind(sp.kind) ? sp.kind : "task2";
  const profile = await requireProfile();

  const opened = await openPractice(profile.id, id, kind);
  if (!opened.ok) redirect(`/writing?kind=${kind}`);
  const { attempt } = opened;

  // Already handed in (an old link, or a second tab): the read-only copy is the
  // right place, not a fresh sitting.
  if (attempt.submitted_at) redirect(`/writing/history/${attempt.id}`);

  const imageUrl = await signedPracticeImage(attempt.image_path);

  return (
    <div className="fixed inset-0 z-40 bg-background">
      <PracticeExam
        kind={attempt.kind}
        attemptId={attempt.id}
        topic={attempt.topic}
        prompt={attempt.prompt}
        imageUrl={imageUrl}
        topic2={attempt.topic2}
        prompt2={attempt.prompt2}
        studentName={profile.name ?? ""}
        initialAnswer={attempt.answer}
        initialAnswer2={attempt.answer2}
        initialRevision={attempt.revision}
        startedAt={attempt.started_at}
      />
    </div>
  );
}
