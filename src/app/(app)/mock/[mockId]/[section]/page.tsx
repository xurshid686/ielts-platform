import { notFound, redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  finalizeExpiredSection,
  getMock,
  getStudentAttempt,
  getWritingDraft,
  signedTask1Image,
  startSection,
  startWriting,
  writingDeadline,
} from "@/lib/mock";
import { nextSection } from "@/lib/mock-shared";
import { MockRunner } from "@/components/mock/mock-runner";
import { WritingExam } from "@/components/mock/writing-exam";

export const metadata = { title: "Mock exam" };

/**
 * One section of the mock: /mock/[id]/listening | reading | writing.
 *
 * A student can only ever be on the section nextSection() says. Any other
 * section — one already submitted, or one not open yet — sends them back to the
 * overview. The paper itself is independently gated in canOpenTrack(), so a
 * student who guesses /api/test-html/<id> gets the same answer.
 *
 * Every section has a SERVER clock (0052): opening it stamps the start once,
 * a reload resumes the same clock (and is recorded), and a clock that has run
 * out is closed from the saved draft before anything renders.
 */
export default async function MockSectionPage({
  params,
}: {
  params: Promise<{ mockId: string; section: string }>;
}) {
  const { mockId, section } = await params;
  if (section !== "listening" && section !== "reading" && section !== "writing") notFound();

  const profile = await requireProfile();

  // Close an expired section FIRST, then start over with a fresh request: this
  // render's GETs are memoized, so nothing read after that write would be current.
  if (await finalizeExpiredSection(profile.id, mockId)) redirect(`/mock/${mockId}`);

  const found = await getStudentAttempt(profile.id, mockId);
  if (!found) redirect("/mock");
  const { attempt } = found;

  if (attempt.status === "released") redirect(`/mock/${mockId}/result`);
  if (attempt.status === "approved" || nextSection(attempt) !== section) redirect(`/mock/${mockId}`);

  if (section === "writing") {
    const started = await startWriting(profile.id, mockId);
    if (!started.ok) redirect(`/mock/${mockId}`);
    // The drafts may come back from this render's fetch memo (see startWriting),
    // which is fine for the text — it did not change in this render. The CLOCK
    // must come from startWriting's own return value, never from `draft`.
    const [draft, mock] = await Promise.all([getWritingDraft(profile.id, mockId), getMock(mockId)]);
    if (!draft || !mock) redirect(`/mock/${mockId}`);
    // Snapshots (0051) — the time and image this student was given, not the mock's current ones.
    const deadline = writingDeadline(started.startedAt, draft.writingMinutes ?? mock.writing_minutes)!;
    const image = await signedTask1Image(draft.task1ImagePath ?? mock.writing_task1_image_path);

    return (
      <WritingExam
        mockId={mockId}
        attemptId={attempt.id}
        title={mock.title}
        deadline={deadline}
        initialTask1={draft.task1}
        initialTask2={draft.task2}
        task1Prompt={draft.task1Prompt ?? mock.writing_task1_prompt ?? ""}
        task2Prompt={draft.task2Prompt ?? mock.writing_task2_prompt ?? ""}
        task1ImageUrl={image}
        reloaded={started.reloaded}
        initialLongAway={started.longAway}
      />
    );
  }

  const started = await startSection(profile.id, mockId, section);
  if (!started.ok) redirect(`/mock/${mockId}`);

  // The attempt carries the paper ids it was approved with — read them with the
  // service role, since the student-facing attempt shape does not expose them.
  const admin = createAdminClient();
  const { data } = await admin
    .from("mock_attempts")
    .select("listening_test_id, reading_test_id")
    .eq("id", attempt.id)
    .single();
  const ids = data as { listening_test_id: string | null; reading_test_id: string | null } | null;
  const testId = section === "listening" ? ids?.listening_test_id : ids?.reading_test_id;
  if (!testId) redirect(`/mock/${mockId}`);

  const { data: test } = await admin.from("tests").select("title").eq("id", testId).single();

  return (
    <MockRunner
      mockId={mockId}
      attemptId={attempt.id}
      section={section}
      testId={testId}
      title={(test as { title?: string } | null)?.title ?? (section === "listening" ? "Listening" : "Reading")}
      nextHref={section === "listening" ? `/mock/${mockId}/reading` : `/mock/${mockId}/writing`}
      nextLabel={section === "listening" ? "Continue to Reading" : "Continue to Writing"}
      deadline={writingDeadline(started.startedAt, started.minutes)!}
      draft={started.draft}
      audioPos={started.audioPos}
      reloaded={started.reloaded}
      initialLongAway={started.longAway}
    />
  );
}
