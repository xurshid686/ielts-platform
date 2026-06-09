import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { asAnswerKey, asAnswers } from "@/lib/ielts/grade";
import { normalizeAnswer } from "@/lib/ielts/extract-key";
import { ReviewView, type ReviewRow } from "@/components/review/review-view";
import type { Result, Test } from "@/types/database";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireProfile();
  const supabase = await createClient();

  // RLS restricts results to the owner (or admin), so no manual user filter needed.
  const { data: resultRow } = await supabase
    .from("results")
    .select("*")
    .eq("id", id)
    .single();

  if (!resultRow) notFound();
  const result = resultRow as Result;

  let title = "Test review";
  let answerKey = null as ReturnType<typeof asAnswerKey>;
  if (result.test_id) {
    const { data: testRow } = await supabase
      .from("tests")
      .select("title, answer_key")
      .eq("id", result.test_id)
      .single();
    const t = testRow as Pick<Test, "title" | "answer_key"> | null;
    if (t?.title) title = t.title;
    answerKey = asAnswerKey(t?.answer_key);
  }

  const answers = asAnswers(result.answers);

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
    rows = Object.keys(answerKey)
      .sort((a, b) => Number(a) - Number(b))
      .map((q) => {
        const yours = answers[q] ?? null;
        const given = normalizeAnswer(yours);
        const status: ReviewRow["status"] = !given
          ? "blank"
          : answerKey![q].includes(given)
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
    />
  );
}
