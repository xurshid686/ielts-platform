import { redirect } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { FeedbackReadMarker } from "@/components/feedback/feedback-read-marker";
import { timeAgo } from "@/lib/utils";
import type { TeacherFeedback } from "@/types/database";

export const metadata = { title: "Feedback" };

export default async function FeedbackPage() {
  const profile = await requireProfile();
  if (!profile.is_my_student) redirect("/dashboard");

  const supabase = await createClient();
  const { data } = await supabase
    .from("teacher_feedback")
    .select("*")
    .eq("student_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(100);

  const feedback = (data ?? []) as TeacherFeedback[];
  const unreadIds = feedback.filter((f) => !f.read_at).map((f) => f.id);

  return (
    <div className="space-y-8">
      {/* Marks everything read once the page is open. */}
      <FeedbackReadMarker ids={unreadIds} />

      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <MessageSquare className="h-6 w-6 text-primary" /> Feedback
        </h1>
        <p className="text-muted">Notes your teacher has sent you.</p>
      </div>

      {feedback.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center">
          <MessageSquare className="mx-auto h-8 w-8 text-muted" />
          <p className="mt-3 text-sm text-muted">No feedback yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {feedback.map((f) => (
            <Card key={f.id} className={!f.read_at ? "border-primary/30 bg-primary/5" : undefined}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted">
                  {f.title ?? f.skill ?? "Feedback"}
                </p>
                <span className="text-[11px] text-muted">{timeAgo(f.created_at)}</span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm">{f.body}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
