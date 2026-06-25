"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, Sparkles } from "lucide-react";
import type { SpeakingQuestion } from "@/types/database";

type Filter = 0 | 1 | 2 | 3; // 0 = All

const TABS: { key: Filter; label: string }[] = [
  { key: 0, label: "All" },
  { key: 1, label: "Part 1" },
  { key: 2, label: "Part 2" },
  { key: 3, label: "Part 3" },
];

const PART_BLURB: Record<number, string> = {
  1: "Short personal interview questions.",
  2: "Cue cards — the long-turn task.",
  3: "Abstract discussion follow-ups.",
};

export function QuestionBank({ questions }: { questions: SpeakingQuestion[] }) {
  const [filter, setFilter] = useState<Filter>(0);

  const count = (p: Filter) =>
    p === 0 ? questions.length : questions.filter((q) => q.part === p).length;

  const visible =
    filter === 0 ? questions : questions.filter((q) => q.part === filter);

  return (
    <div className="space-y-6">
      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2">
        {TABS.map(({ key, label }) => {
          const active = filter === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              aria-pressed={active}
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-surface text-foreground hover:border-primary/50"
              }`}
            >
              {label}
              <span
                className={`rounded-full px-1.5 text-xs ${
                  active ? "bg-primary-foreground/20" : "bg-primary/10 text-primary"
                }`}
              >
                {count(key)}
              </span>
            </button>
          );
        })}
      </div>

      {filter !== 0 && (
        <p className="text-sm text-muted">{PART_BLURB[filter]}</p>
      )}

      {/* Question list */}
      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted">
          No questions in this part yet.
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((q) => (
            <details
              key={q.id}
              className="group rounded-2xl border border-border bg-surface p-5"
            >
              <summary className="flex cursor-pointer items-center justify-between gap-3">
                <span className="flex items-center gap-3">
                  <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                    Part {q.part}
                  </span>
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
              <div className="mt-4 flex flex-wrap items-center gap-4">
                <Link
                  href={`/speaking/questions/${q.id}`}
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                >
                  <Sparkles className="h-3.5 w-3.5" /> Practice this topic
                </Link>
                {q.channel_link && (
                  <a
                    href={q.channel_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    View in channel <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
