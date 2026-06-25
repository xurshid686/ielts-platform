import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TopicPractice } from "@/components/speaking/topic-practice";
import type { SpeakingQuestion } from "@/types/database";

export default async function TopicPracticePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireProfile();
  const { id } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from("speaking_questions")
    .select("*")
    .eq("id", id)
    .single();

  if (!data) notFound();
  const q = data as SpeakingQuestion;

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/speaking/questions"
          className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to question bank
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-primary">
            Part {q.part}
          </span>
          {q.number && (
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
              {q.number}
            </span>
          )}
        </div>
        <h1 className="mt-2 text-2xl font-bold">{q.title}</h1>
      </div>

      {/* The questions themselves */}
      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Questions
        </h2>
        <div className="mt-3 whitespace-pre-line text-sm leading-relaxed text-foreground/90">
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
      </section>

      {/* AI practice material */}
      <TopicPractice question={q} />
    </div>
  );
}
