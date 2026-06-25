import Link from "next/link";
import { MessagesSquare, ArrowLeft, ExternalLink } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { SpeakingQuestion } from "@/types/database";

export const metadata = { title: "Speaking question bank" };

const PARTS: { part: 1 | 2 | 3; label: string; blurb: string }[] = [
  { part: 1, label: "Part 1", blurb: "Short personal interview questions." },
  { part: 2, label: "Part 2", blurb: "Cue cards — the long-turn task." },
  { part: 3, label: "Part 3", blurb: "Abstract discussion follow-ups." },
];

export default async function SpeakingQuestionsPage() {
  await requireProfile();
  const supabase = await createClient();

  const { data } = await supabase
    .from("speaking_questions")
    .select("*")
    .order("channel_message_id", { ascending: true });

  const questions = (data as SpeakingQuestion[] | null) ?? [];
  const byPart = (p: number) => questions.filter((q) => q.part === p);

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
              Real exam questions, grouped by part. {questions.length} total.
            </p>
          </div>
        </div>
      </div>

      {questions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted">
          No questions yet — they will appear here automatically as they are added.
        </div>
      ) : (
        PARTS.map(({ part, label, blurb }) => {
          const items = byPart(part);
          if (items.length === 0) return null;
          return (
            <section key={part} className="space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
                <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-primary/15 px-2 text-xs font-bold text-primary">
                  {part}
                </span>
                {label}
                <span className="font-normal normal-case text-muted/70">· {blurb}</span>
                <span className="ml-auto text-xs font-normal text-muted/70">
                  {items.length}
                </span>
              </h2>
              <div className="space-y-3">
                {items.map((q) => (
                  <details
                    key={q.id}
                    className="group rounded-2xl border border-border bg-surface p-5"
                  >
                    <summary className="flex cursor-pointer items-center justify-between gap-3">
                      <span className="flex items-center gap-3">
                        {q.number && (
                          <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                            {q.number}
                          </span>
                        )}
                        <span className="font-semibold">{q.title}</span>
                      </span>
                      <span className="text-xs text-muted transition-transform group-open:rotate-180">
                        ▾
                      </span>
                    </summary>
                    <div className="mt-4 whitespace-pre-line text-sm leading-relaxed text-foreground/90">
                      {q.content}
                    </div>
                    {q.channel_link && (
                      <a
                        href={q.channel_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                      >
                        View in channel <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </details>
                ))}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
