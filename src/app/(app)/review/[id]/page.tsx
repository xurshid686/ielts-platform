import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile } from "@/lib/auth";
import { isPremiumActive } from "@/lib/premium";
import { asAnswerKey, asAnswers, isAnswerCorrect } from "@/lib/ielts/grade";
import { ReviewView, type ReviewRow } from "@/components/review/review-view";
import type { Result, Test } from "@/types/database";
import { rows as asRows } from "@/types/database";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const viewer = await requireProfile();
  const supabase = await createClient();

  // RLS restricts results to the owner (or admin), so no manual user filter needed.
  const { data: resultRow } = await supabase
    .from("results")
    .select("*")
    .eq("id", id)
    .single();

  if (!resultRow) notFound();
  const result = resultRow as Result;

  // If an admin is viewing another student's attempt (allowed by RLS), name the
  // student. There is no per-student attempts list any more, so no back link.
  let subjectName: string | undefined;
  const backHref: string | undefined = undefined;
  const backLabel: string | undefined = undefined;
  if (result.user_id !== viewer.id) {
    const { data: subjRow } = await supabase
      .from("profiles")
      .select("name, email")
      .eq("id", result.user_id)
      .single();
    const subj = subjRow as { name: string | null; email: string | null } | null;
    subjectName = subj?.name || subj?.email || "Student";
  }

  let title = "Test review";
  let answerKey = null as ReturnType<typeof asAnswerKey>;
  if (result.test_id) {
    // The key is read with the SERVICE-ROLE client: `answer_key` is revoked
    // from the `authenticated` role (migration 0034). It is safe here because
    // this page only ever renders the key for questions the student has already
    // submitted, and RLS above has already proven they own this result.
    const { data: testRow } = await createAdminClient()
      .from("tests")
      .select("title, answer_key")
      .eq("id", result.test_id)
      .single();
    const t = testRow as Pick<Test, "title" | "answer_key"> | null;
    if (t?.title) title = t.title;
    answerKey = asAnswerKey(t?.answer_key);
  }

  const answers = asAnswers(result.answers);

  // "What next": the next test in this skill the student hasn't attempted, and
  // how much of the library is still behind the paywall. Only computed for the
  // student's own attempt — an admin reviewing someone else sees neither.
  const isOwnAttempt = result.user_id === viewer.id;
  const hasPremium = viewer.role === "admin" || isPremiumActive(viewer);
  let nextTest: { id: string; title: string; kind: "single" | "full" } | null = null;
  let lockedCount = 0;

  if (isOwnAttempt) {
    const [{ data: catalogue }, { data: mine }] = await Promise.all([
      supabase
        .from("tests")
        .select("id, title, kind, tier, track, created_at")
        .eq("skill", result.skill)
        .order("created_at", { ascending: false }),
      supabase.from("results").select("test_id").eq("user_id", viewer.id).eq("skill", result.skill),
    ]);

    type Row = { id: string; title: string; kind: "single" | "full"; tier: string; track: string | null };
    const rowsAll = asRows<Row>(catalogue).filter(
      (t) => (t.track ?? "regular") === "regular",
    );
    const attempted = new Set(
      ((mine ?? []) as { test_id: string | null }[]).map((r) => r.test_id).filter(Boolean),
    );

    lockedCount = hasPremium ? 0 : rowsAll.filter((t) => t.tier === "premium").length;
    const openToThem = rowsAll.filter((t) => t.tier !== "premium" || hasPremium);
    const candidate = openToThem.find((t) => t.id !== result.test_id && !attempted.has(t.id));
    if (candidate) {
      nextTest = { id: candidate.id, title: candidate.title, kind: candidate.kind };
    }
  }

  // Build the per-question rows. We can only show a true correct/incorrect
  // breakdown when both the answer key and the saved answers exist.
  let rows: ReviewRow[] = [];
  let note: string | undefined;

  if (!answerKey) {
    note =
      "This test has no stored answer key, so a question-by-question breakdown isn't available. Your overall score is shown above.";
  } else if (!answers) {
    note =
      "Answers weren't recorded for this attempt (it predates answer-saving, or was entered manually). Retake the test to get a full breakdown next time.";
  } else {
    // `results.skill` is the wider Skill union; only the two auto-graded ones
    // reach this branch (the others have no answer key).
    const markingSkill = result.skill === "listening" ? "listening" : "reading";
    // isAnswerCorrect is the SAME matcher gradeAnswers uses to compute the
    // score, skill and all. Re-implementing it here as a bare
    // `accepted.includes(given)` dropped the listening space-insensitive rule,
    // so this breakdown could mark an answer wrong that the band was awarded for.
    rows = Object.keys(answerKey)
      .sort((a, b) => Number(a) - Number(b))
      .map((q) => {
        const yours = answers[q] ?? null;
        const status: ReviewRow["status"] = !yours?.trim()
          ? "blank"
          : isAnswerCorrect(answerKey![q], yours, markingSkill)
            ? "correct"
            : "incorrect";
        return { q, yours, accepted: answerKey![q], status };
      });
  }

  return (
    <ReviewView
      title={title}
      skill={result.skill}
      band={result.band != null ? Number(result.band) : null}
      raw={result.raw}
      total={result.total}
      submittedAt={result.submitted_at}
      rows={rows}
      note={note}
      subjectName={subjectName}
      backHref={backHref}
      backLabel={backLabel}
      nextTest={nextTest}
      showUpgrade={isOwnAttempt && !hasPremium}
      lockedCount={lockedCount}
    />
  );
}
