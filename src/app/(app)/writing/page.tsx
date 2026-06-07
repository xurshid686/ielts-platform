import Link from "next/link";
import { PenLine, ArrowRight, Calendar } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { WRITING_PROMPTS } from "@/lib/ielts/writing-prompts";
import { WritingFeedbackView } from "@/components/writing/writing-feedback";
import type { WritingSubmission } from "@/types/database";

export default async function WritingPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data } = await supabase
    .from("writing_submissions")
    .select("*")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(10);
  const subs = (data ?? []) as WritingSubmission[];

  const tasks = [
    { key: "task2", label: "Task 2 — Essay", desc: "A 250-word argument essay (40 min)." },
    { key: "task1", label: "Task 1 — Letter", desc: "A 150-word letter (20 min)." },
  ] as const;

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <PenLine className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Writing</h1>
          <p className="text-sm text-muted">
            Write to a prompt and get an instant AI band estimate with corrections.
          </p>
        </div>
      </div>

      {tasks.map((t) => {
        const prompts = WRITING_PROMPTS.filter((p) => p.task === t.key);
        return (
          <section key={t.key} className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{t.label}</h2>
              <p className="text-xs text-muted">{t.desc}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {prompts.map((p) => (
                <Link
                  key={p.id}
                  href={`/writing/${p.id}`}
                  className="group flex flex-col rounded-2xl border border-border bg-surface p-5 shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-elevated"
                >
                  <h3 className="font-semibold">{p.title}</h3>
                  <p className="mt-1 line-clamp-3 flex-1 text-sm text-muted">{p.prompt}</p>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
                    Start writing{" "}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
              ))}
            </div>
          </section>
        );
      })}

      {/* History */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Your submissions</h2>
        {subs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted">
            No writing submitted yet — pick a prompt above to start.
          </div>
        ) : (
          <div className="space-y-3">
            {subs.map((s) => (
              <details key={s.id} className="rounded-2xl border border-border bg-surface p-5 shadow-soft">
                <summary className="flex cursor-pointer items-center justify-between gap-3">
                  <span className="flex items-center gap-3">
                    <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-lg font-bold text-primary">
                      {s.score ?? "—"}
                    </span>
                    <span>
                      <span className="text-sm font-medium capitalize">
                        {s.task_type === "task1" ? "Task 1" : "Task 2"} ·{" "}
                        {s.prompt?.split("\n")[0]}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1 text-xs text-muted">
                        <Calendar className="h-3 w-3" />
                        {new Date(s.created_at).toLocaleDateString()}
                      </span>
                    </span>
                  </span>
                  <span className="text-xs text-muted">details</span>
                </summary>
                <div className="mt-5 space-y-4">
                  <div className="rounded-xl bg-surface-2 p-4 text-sm">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
                      Your response
                    </p>
                    <p className="whitespace-pre-wrap">{s.content}</p>
                  </div>
                  {s.feedback ? (
                    <WritingFeedbackView feedback={s.feedback} />
                  ) : (
                    <p className="text-sm text-muted">No AI feedback was generated for this one.</p>
                  )}
                </div>
              </details>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
