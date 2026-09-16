import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getReleasedDetail } from "@/lib/mock";

export const metadata = { title: "Mock paper review" };

/**
 * The paper a student SAT, reopened read-only after release (owner, 2026-09-16).
 *
 * Everything that makes it read-only is in the served file
 * (/api/test-html/<id>?review=<attempt>, adaptForReview): their own answers are
 * poured back in, the paper marks itself with the key, and the inputs, submit
 * and Retake are locked. This page is only the frame around it — no ExamGuard,
 * no fullscreen, no clock: the exam is over.
 */
export default async function MockPaperReviewPage({
  params,
}: {
  params: Promise<{ mockId: string; section: string }>;
}) {
  const { mockId, section } = await params;
  if (section !== "listening" && section !== "reading") notFound();

  const profile = await requireProfile();
  const detail = await getReleasedDetail(profile.id, mockId);
  if (!detail) redirect(`/mock/${mockId}`);

  const testId =
    section === "listening" ? detail.attempt.listening_test_id : detail.attempt.reading_test_id;
  const submitted =
    section === "listening" ? detail.attempt.listening_submitted_at : detail.attempt.reading_submitted_at;
  if (!testId || !submitted) redirect(`/mock/${mockId}/result`);

  const admin = createAdminClient();
  const { data: test } = await admin.from("tests").select("title").eq("id", testId).maybeSingle();
  const label = section === "listening" ? "Listening" : "Reading";
  const raw = section === "listening" ? detail.attempt.listening_raw : detail.attempt.reading_raw;
  const total = section === "listening" ? detail.attempt.listening_total : detail.attempt.reading_total;

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background">
      <div className="flex h-14 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-3">
        <Link
          href={`/mock/${mockId}/result`}
          className="inline-flex h-10 items-center gap-1 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to your result
        </Link>
        <p className="truncate text-sm font-medium">
          {label} review
          <span className="ml-2 font-normal text-muted">{(test as { title?: string } | null)?.title ?? ""}</span>
        </p>
        <p className="text-sm tabular-nums text-muted">{raw != null ? `${raw}/${total ?? "?"} correct` : ""}</p>
      </div>
      <iframe
        src={`/api/test-html/${testId}?review=${detail.attempt.id}`}
        title={`${label} paper review`}
        allow="autoplay"
        className="min-h-0 w-full flex-1 bg-white"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
      />
    </div>
  );
}
