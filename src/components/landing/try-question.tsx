"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, X } from "lucide-react";
import { testPath } from "@/lib/tests/ref";

/**
 * The landing page's hero: one real question a visitor can answer and see
 * marked on the spot, before any account or page load.
 *
 * It is a SAMPLE, not a graded attempt. The one answer is in this file on
 * purpose: nothing is sent to the server, nothing is saved, and it never
 * touches `/api/guest-grade` (which is rate-limited per IP). The paper it
 * comes from is free and public, and its passage and answers are already on
 * its own page.
 *
 * The text is copied VERBATIM from the paper (paragraph A and question 28 of
 * "Willpower"), and the answer is the stored key's. If that paper is ever
 * replaced or deleted, change `SAMPLE` — the link below goes to its id.
 */
const SAMPLE = {
  test: { id: "569a9a91-d0f7-4383-a958-4cfc7f47df05", slug: "willpower" },
  title: "Willpower",
  totalQuestions: 14,
  letter: "A",
  // The last sentence is the evidence, shown highlighted once answered.
  passage:
    "Although willpower does not shape our decisions, it determines whether and how long we can follow through on them. It almost single-handedly determines life outcomes. Interestingly, research suggests the general population is indeed aware of how essential willpower is to their wellbeing; survey participants routinely identify a ‘lack of willpower’ as the major impediment to making beneficial life changes. There are, however, misunderstandings surrounding the nature of willpower and how we can acquire more of it. ",
  evidence:
    "There is a widespread misperception, for example, that increased leisure time would lead to subsequent increases in willpower.",
  number: 28,
  statement: "People with more free time typically have better willpower.",
  answer: "FALSE",
  why: "The passage calls this idea “a widespread misperception”, so the statement contradicts what the writer says.",
} as const;

const OPTIONS = ["TRUE", "FALSE", "NOT GIVEN"] as const;
type Option = (typeof OPTIONS)[number];

export function TryQuestion() {
  const [picked, setPicked] = useState<Option | null>(null);
  const answered = picked !== null;
  const correct = picked === SAMPLE.answer;

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 text-left shadow-elevated sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
        Try one real question
      </p>
      <p className="mt-1 text-sm text-muted">
        From “{SAMPLE.title}”, a free Reading passage on this site.
      </p>

      <div className="mt-4 flex gap-3 border-t border-border pt-4">
        <span className="pt-0.5 text-sm font-bold">{SAMPLE.letter}</span>
        <p className="text-sm leading-relaxed">
          {SAMPLE.passage}
          <span
            className={
              answered
                ? "rounded-sm bg-primary/15 box-decoration-clone px-0.5 transition-colors duration-300"
                : undefined
            }
          >
            {SAMPLE.evidence}
          </span>
        </p>
      </div>

      <fieldset className="mt-5 border-t border-border pt-4">
        <legend className="sr-only">
          Does the statement agree with the information in the passage?
        </legend>
        <p className="flex gap-2.5 text-sm font-medium">
          <span className="flex h-6 min-w-6 items-center justify-center rounded border border-primary/60 px-1 text-xs font-bold tabular-nums text-primary">
            {SAMPLE.number}
          </span>
          {SAMPLE.statement}
        </p>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {OPTIONS.map((o) => {
            const isPicked = picked === o;
            const isAnswer = o === SAMPLE.answer;
            // Before answering: three equal buttons. After: the right answer
            // is marked, a wrong pick is marked, the rest step back.
            const state = !answered
              ? "border-border bg-surface-2/60 hover:border-primary/50 hover:bg-primary/5"
              : isAnswer
                ? "border-success bg-success/10 text-success"
                : isPicked
                  ? "border-danger bg-danger/10 text-danger"
                  : "border-border text-muted opacity-60";
            return (
              <button
                key={o}
                type="button"
                disabled={answered}
                aria-pressed={isPicked}
                onClick={() => setPicked(o)}
                className={`flex min-h-11 items-center justify-center gap-1.5 rounded-lg border px-2 text-xs font-semibold tracking-wide transition-colors sm:text-sm ${state} ${
                  answered ? "cursor-default" : "cursor-pointer"
                }`}
              >
                {answered && isAnswer && <Check className="h-4 w-4 shrink-0" aria-hidden />}
                {answered && isPicked && !isAnswer && <X className="h-4 w-4 shrink-0" aria-hidden />}
                {o}
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* Announced to a screen reader when the mark appears. */}
      <div aria-live="polite">
        {answered && (
          <div className="animate-fade-in-up mt-4 border-t border-border pt-4">
            <p className={`text-sm font-semibold ${correct ? "text-success" : "text-danger"}`}>
              {correct ? "Correct." : "Not quite."} The answer is {SAMPLE.answer}.
            </p>
            <p className="mt-1 text-sm leading-relaxed text-muted">{SAMPLE.why}</p>
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
              <Link
                href={testPath("reading", SAMPLE.test)}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
              >
                Sit all {SAMPLE.totalQuestions} questions, free <ArrowRight className="h-4 w-4" />
              </Link>
              <button
                type="button"
                onClick={() => setPicked(null)}
                className="cursor-pointer text-sm text-muted underline-offset-2 hover:text-foreground hover:underline"
              >
                Try again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
