import { notFound, redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  finalizeExpiredSection,
  getMock,
  getStudentAttempt,
  getWritingDraft,
  sectionView,
  signedTask1Image,
  startSection,
  startWriting,
  writingDeadline,
} from "@/lib/mock";
import { nextSection } from "@/lib/mock-shared";
import { SectionFlow } from "@/components/mock/section-flow";

export const metadata = { title: "Mock exam" };

/**
 * One section of the mock: /mock/[id]/listening | reading | writing.
 *
 * A student can only ever be on the section nextSection() says. Any other
 * section — one already submitted, or one not open yet — sends them back to the
 * overview. The paper itself is independently gated in canOpenTrack(), so a
 * student who guesses /api/test-html/<id> gets the same answer.
 *
 * 0054: rendering this page never starts a clock. It shows the instruction
 * video, then the Start button (beginMockSection starts the clock), and only a
 * section whose clock is ALREADY running is resumed here — which the server
 * records as a reload, as before.
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
  const { attempt, mock } = found;

  if (attempt.status === "released") redirect(`/mock/${mockId}/result`);
  // "Start the mock" on the overview comes first (it is gated on the session too).
  if (attempt.status === "approved" || nextSection(attempt) !== section) redirect(`/mock/${mockId}`);

  const view = await sectionView(profile.id, mockId, section);
  if (!view.ok) redirect(`/mock/${mockId}`);

  const nextHref = section === "listening" ? `/mock/${mockId}/reading` : section === "reading" ? `/mock/${mockId}/writing` : `/mock/${mockId}`;
  const nextLabel = section === "listening" ? "Continue to Reading" : "Continue to Writing";
  const common = {
    mockId,
    attemptId: attempt.id,
    section,
    mockTitle: mock.title,
    minutes: view.minutes,
    video: view.video ? { url: view.video.url, duration: view.video.duration } : null,
    videoPos: view.videoPos,
    blocked: view.blocked,
    nextHref,
    nextLabel,
  } as const;

  if (view.phase !== "active") {
    return <SectionFlow {...common} phase={view.phase} reloaded={false} initialLongAway={0} />;
  }

  if (section === "writing") {
    const started = await startWriting(profile.id, mockId);
    if (!started.ok) redirect(`/mock/${mockId}`);
    // The drafts may come back from this render's fetch memo (see startWriting),
    // which is fine for the text — it did not change in this render. The CLOCK
    // must come from startWriting's own return value, never from `draft`.
    const [draft, fresh] = await Promise.all([getWritingDraft(profile.id, mockId), getMock(mockId)]);
    if (!draft || !fresh) redirect(`/mock/${mockId}`);
    // Snapshots (0051) — the time and image this student was given, not the mock's current ones.
    const deadline = writingDeadline(started.startedAt, draft.writingMinutes ?? fresh.writing_minutes)!;
    const image = await signedTask1Image(draft.task1ImagePath ?? fresh.writing_task1_image_path);
    return (
      <SectionFlow
        {...common}
        phase="active"
        reloaded
        initialLongAway={started.longAway}
        writing={{
          title: fresh.title,
          deadline,
          initialTask1: draft.task1,
          initialTask2: draft.task2,
          task1Prompt: draft.task1Prompt ?? fresh.writing_task1_prompt ?? "",
          task2Prompt: draft.task2Prompt ?? fresh.writing_task2_prompt ?? "",
          task1ImageUrl: image,
        }}
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
    <SectionFlow
      {...common}
      phase="active"
      reloaded
      initialLongAway={started.longAway}
      paper={{
        deadline: writingDeadline(started.startedAt, started.minutes)!,
        draft: started.draft,
        audioPos: started.audioPos,
        testId,
        title: (test as { title?: string } | null)?.title ?? (section === "listening" ? "Listening" : "Reading"),
      }}
    />
  );
}
