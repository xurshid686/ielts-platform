import { notFound, redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getStudentAttempt,
  getWritingDraft,
  getMock,
  signedTask1Image,
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
 */
export default async function MockSectionPage({
  params,
}: {
  params: Promise<{ mockId: string; section: string }>;
}) {
  const { mockId, section } = await params;
  if (section !== "listening" && section !== "reading" && section !== "writing") notFound();

  const profile = await requireProfile();
  const found = await getStudentAttempt(profile.id, mockId);
  if (!found) redirect("/mock");
  const { attempt } = found;

  if (attempt.status === "released") redirect(`/mock/${mockId}/result`);
  if (attempt.status === "approved" || nextSection(attempt) !== section) redirect(`/mock/${mockId}`);

  if (section === "writing") {
    // Starting the clock is a write, and this is the one moment it should
    // happen: the student has actually opened Writing.
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
      <div className="space-y-4">
        <h1 className="text-xl font-bold">{mock.title} — Writing</h1>
        <WritingExam
          mockId={mockId}
          deadline={deadline}
          initialTask1={draft.task1}
          initialTask2={draft.task2}
          task1Prompt={draft.task1Prompt ?? mock.writing_task1_prompt ?? ""}
          task2Prompt={draft.task2Prompt ?? mock.writing_task2_prompt ?? ""}
          task1ImageUrl={image}
        />
      </div>
    );
  }

  // The attempt carries the paper ids it was approved with — read them with the
  // service role, since the student-facing attempt shape does not expose them.
  const { data } = await createAdminClient()
    .from("mock_attempts")
    .select("listening_test_id, reading_test_id")
    .eq("id", attempt.id)
    .single();
  const ids = data as { listening_test_id: string | null; reading_test_id: string | null } | null;
  const testId = section === "listening" ? ids?.listening_test_id : ids?.reading_test_id;
  if (!testId) redirect(`/mock/${mockId}`);

  const { data: test } = await createAdminClient().from("tests").select("title").eq("id", testId).single();

  return (
    <MockRunner
      mockId={mockId}
      section={section}
      testId={testId}
      title={(test as { title?: string } | null)?.title ?? (section === "listening" ? "Listening" : "Reading")}
      nextHref={section === "listening" ? `/mock/${mockId}/reading` : `/mock/${mockId}/writing`}
      nextLabel={section === "listening" ? "Continue to Reading" : "Continue to Writing"}
    />
  );
}
