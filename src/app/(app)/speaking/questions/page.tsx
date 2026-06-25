import Link from "next/link";
import { MessagesSquare, ArrowLeft } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { QuestionBank } from "@/components/speaking/question-bank";
import type { SpeakingQuestion } from "@/types/database";

export const metadata = { title: "Speaking question bank" };

export default async function SpeakingQuestionsPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  // The list doesn't need the (large) study column — keep the payload light.
  const { data } = await supabase
    .from("speaking_questions")
    .select("id, part, title, number, content, channel_message_id, channel_link")
    .order("channel_message_id", { ascending: true });

  const questions = (data as SpeakingQuestion[] | null) ?? [];

  // Which topics has this student marked as completed?
  const { data: completions } = await createAdminClient()
    .from("speaking_completions")
    .select("question_id")
    .eq("user_id", profile.id);
  const completedIds = (completions ?? []).map(
    (c) => (c as { question_id: string }).question_id,
  );

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/speaking"
          className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Speaking
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <MessagesSquare className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Speaking question bank</h1>
            <p className="text-sm text-muted">
              Real exam questions. Filter by part and progress below.
            </p>
          </div>
        </div>
      </div>

      {questions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted">
          No questions yet — they will appear here automatically as they are added.
        </div>
      ) : (
        <QuestionBank questions={questions} completedIds={completedIds} />
      )}
    </div>
  );
}
