"use client";

import { useState, useTransition } from "react";
import { Lightbulb, BookA, MessageSquareQuote, Sparkles, Loader2 } from "lucide-react";
import { getOrCreateSpeakingStudy } from "@/app/actions/speaking-study";
import type { SpeakingQuestion, SpeakingStudy } from "@/types/database";

export function TopicPractice({ question }: { question: SpeakingQuestion }) {
  const [study, setStudy] = useState<SpeakingStudy | null>(question.study);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function generate() {
    setError(null);
    startTransition(async () => {
      const res = await getOrCreateSpeakingStudy(question.id);
      if (res.ok) setStudy(res.study);
      else setError(res.error);
    });
  }

  if (!study) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-10 text-center">
        <Sparkles className="mx-auto h-8 w-8 text-primary" />
        <h2 className="mt-3 font-semibold">Practice this topic</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted">
          Generate ideas, topic vocabulary and natural sample answers to help you
          prepare for this topic.
        </p>
        <button
          type="button"
          onClick={generate}
          disabled={pending}
          className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Generating…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" /> Generate practice material
            </>
          )}
        </button>
        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Ideas */}
      {study.ideas.length > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Lightbulb className="h-5 w-5 text-primary" /> Ideas to talk about
          </h2>
          <ul className="space-y-2">
            {study.ideas.map((idea, i) => (
              <li
                key={i}
                className="flex gap-3 rounded-xl border border-border bg-surface p-4 text-sm"
              >
                <span className="font-semibold text-primary">{i + 1}.</span>
                <span>{idea}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Vocabulary */}
      {study.vocabulary.length > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <BookA className="h-5 w-5 text-primary" /> Topic vocabulary
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {study.vocabulary.map((v, i) => (
              <div key={i} className="rounded-xl border border-border bg-surface p-4">
                <p className="font-semibold text-primary">{v.term}</p>
                <p className="mt-1 text-sm text-muted">{v.meaning}</p>
                <p className="mt-2 text-sm italic text-foreground/80">“{v.example}”</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Sample answers */}
      {study.samples.length > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <MessageSquareQuote className="h-5 w-5 text-primary" /> Natural sample answers
          </h2>
          <div className="space-y-3">
            {study.samples.map((s, i) => (
              <div key={i} className="rounded-xl border border-border bg-surface p-5">
                <p className="font-medium">{s.prompt}</p>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground/90">
                  {s.answer}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="text-center text-xs text-muted/70">
        AI-generated study material — use it as a model, not a script.
      </p>
    </div>
  );
}
