import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ArrowRight, Clock } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { finalizeExpiredSection, getStudentAttempt } from "@/lib/mock";
import { SECTION_ORDER, admissionError, nextSection, STATUS_LABEL, type MockSection } from "@/lib/mock-shared";
import { Card } from "@/components/ui/card";
import { AutoRefresh, BeginMockButton } from "@/components/mock/mock-actions";
import { DeviceNotice } from "@/components/mock/device-notice";
import { SectionRow } from "@/components/mock/section-menu";

export const metadata = { title: "Mock exam" };

export default async function MockOverviewPage({ params }: { params: Promise<{ mockId: string }> }) {
  const { mockId } = await params;
  const profile = await requireProfile();
  // A section whose clock ran out while the student was away is closed from its
  // saved draft; redirect so the render below reads fresh (fetch memo, 0052).
  if (await finalizeExpiredSection(profile.id, mockId)) redirect(`/mock/${mockId}`);
  const found = await getStudentAttempt(profile.id, mockId);

  // No place on this mock: the list page is where a student requests one.
  if (!found) redirect("/mock");
  const { mock, attempt } = found;
  if (attempt.status === "released") redirect(`/mock/${mockId}/result`);

  const current = nextSection(attempt);
  const submittedAt: Record<MockSection, string | null> = {
    listening: attempt.listening_submitted_at,
    reading: attempt.reading_submitted_at,
    writing: attempt.writing_submitted_at,
  };
  if (!mock) notFound();
  // Can this student start something new right now? (Owner's Start/End session, 0054.)
  const refused = admissionError(mock.session_state, attempt.status);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href="/mock" className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> All mocks
      </Link>

      <header>
        <p className="text-xs font-medium uppercase tracking-wide text-primary">
          {STATUS_LABEL[attempt.status]}
        </p>
        <h1 className="mt-1 text-2xl font-bold">{mock.title}</h1>
        {mock.description && <p className="mt-1 text-sm text-muted">{mock.description}</p>}
      </header>

      {attempt.status === "approved" && mock.session_state === "waiting" && (
        <Card className="flex items-start gap-3 border-warning/40 bg-warning/5">
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
          <div className="text-sm">
            <p className="font-semibold">Waiting for your teacher to start the session</p>
            <p className="mt-1 text-muted">
              Your place is approved. The mock opens for everyone when your teacher starts the session — this page updates by
              itself.
            </p>
          </div>
          <AutoRefresh />
        </Card>
      )}

      {attempt.status === "approved" && mock.session_state === "closed" && (
        <Card className="text-sm text-muted">This mock session has ended, so it can no longer be started. Ask your teacher about the next sitting.</Card>
      )}

      {attempt.status === "approved" && mock.session_state === "running" && (
        <Card className="space-y-3 border-primary/25 bg-primary/5">
          <h2 className="font-semibold">Before you start</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
            <li>You get ONE attempt. A submitted section cannot be reopened.</li>
            <li>Each section begins with a short <b>instruction video</b>. You can skip it; the section clock starts when you click Start after it.</li>
            <li>The sections go in exam order: Listening, Reading, then Writing.</li>
            <li>Use a <b>laptop or desktop computer</b> (phones are not supported), headphones and a quiet room.</li>
            <li>Each section runs in <b>fullscreen</b>. Leaving fullscreen hides the test; <b>the clock keeps running</b> (Listening audio pauses until you return).</li>
            <li>Leaving fullscreen, switching tabs, reloading and large pastes are <b>recorded for your teacher</b>.</li>
            <li>No scores are shown during the mock. Your teacher releases the full result.</li>
          </ul>
          <DeviceNotice>
            <BeginMockButton mockId={mockId} href={`/mock/${mockId}/listening`} label="Start the mock" />
          </DeviceNotice>
        </Card>
      )}

      <ol className="space-y-3">
        {SECTION_ORDER.map((id, i) => {
          const done = !!submittedAt[id];
          const isCurrent = current === id && attempt.status !== "approved";
          return (
            <li key={id}>
              <SectionRow
                state={{ section: id, done, current: isCurrent }}
                index={i}
                action={
                  isCurrent && !refused ? (
                    <Link
                      // Never prefetch: rendering a section page starts its clock / records a reload.
                      prefetch={false}
                      href={`/mock/${mockId}/${id}`}
                      className="inline-flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                    >
                      {attempt.current_minutes_left != null ? `Continue · ${attempt.current_minutes_left} min left` : "Open"}{" "}
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  ) : undefined
                }
              />
            </li>
          );
        })}
      </ol>

      {attempt.status === "submitted" && (
        <Card className="text-sm text-muted">
          All sections are submitted. Your teacher is marking your writing — when your result is released
          we email it to you with your results paper attached, and you get a notification here.
        </Card>
      )}
    </div>
  );
}
