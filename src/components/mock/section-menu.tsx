"use client";

import { ArrowRight, BookOpen, Check, Headphones, Loader2, Lock, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { MockSection } from "@/lib/mock-shared";
import { cn } from "@/lib/utils";

export const SECTION_META: Record<MockSection, { label: string; icon: typeof Headphones; note: string }> = {
  listening: { label: "Listening", icon: Headphones, note: "A short instruction video, then the recording. It plays once." },
  reading: { label: "Reading", icon: BookOpen, note: "A short instruction video, then the paper. Answers autosave." },
  writing: { label: "Writing", icon: PenLine, note: "A short instruction video, then Task 1 and Task 2 on one clock." },
};

/** What the student is told about one section. Server-derived; no live clock. */
export type SectionState = {
  section: MockSection;
  done: boolean;
  current: boolean;
};

/**
 * One row of the three-section list. Shared by the mock overview page and the
 * between-sections menu inside the exam, so the student sees the same thing in
 * both places. Presentation only — the caller supplies the action.
 */
export function SectionRow({
  state,
  index,
  action,
}: {
  state: SectionState;
  index: number;
  action?: React.ReactNode;
}) {
  const meta = SECTION_META[state.section];
  const Icon = meta.icon;
  return (
    <Card className={cn("flex flex-wrap items-center justify-between gap-3", state.current && "border-primary/40")}>
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-xl",
            state.done ? "bg-success/10 text-success" : "bg-primary/10 text-primary",
          )}
        >
          {state.done ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
        </span>
        <div>
          <p className="font-medium">
            {index + 1}. {meta.label}
          </p>
          <p className="text-xs text-muted">{state.done ? "Submitted" : meta.note}</p>
        </div>
      </div>
      {action ?? (!state.done && <Lock className="h-4 w-4 text-muted" aria-label="Not open yet" />)}
    </Card>
  );
}

/**
 * The screen BETWEEN sections (2026-09-17), inside the exam's fullscreen shell.
 *
 * Before this, finishing a section left the student on a "submitted" card while
 * a silent client navigation fetched the next section and its instruction video
 * — several seconds in which nothing moved and the button still looked clickable.
 * They reasonably concluded the app had hung.
 *
 * So the menu appears the moment a section is confirmed submitted: it shows
 * where they are in the sitting, says plainly that no clock is running, and
 * gives them one thing to press. The next section's descriptor and its video are
 * fetched while they read it.
 *
 * It NEVER starts a clock. "Continue to X" only opens that section's
 * instructions; `beginMockSection` behind the later "Start X" is still the one
 * and only thing that stamps a start time.
 */
export function SectionMenu({
  mockTitle,
  states,
  nextSection,
  onContinue,
  onFinish,
  loading,
  error,
  onRetry,
}: {
  mockTitle: string;
  states: SectionState[];
  /** The section "Continue" leads to, or null when the sitting is over. */
  nextSection: MockSection | null;
  onContinue: () => void;
  onFinish: () => void;
  /** The next section's descriptor is still on its way. */
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const label = nextSection ? SECTION_META[nextSection].label : null;
  return (
    <div className="flex h-full items-center justify-center overflow-auto bg-background p-6">
      <div className="w-full max-w-xl space-y-5">
        <div className="text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-primary">{mockTitle}</p>
          <h1 className="mt-1 text-xl font-bold">{label ? `${label} is next` : "All sections submitted"}</h1>
          <p className="mt-1 text-sm text-muted">
            {label
              ? "Your timer has not started. It starts only when you press Start after the instructions."
              : "Your answers are saved. Your teacher releases the full result once everything is marked."}
          </p>
        </div>

        <ol className="space-y-3">
          {states.map((s, i) => (
            <li key={s.section}>
              <SectionRow state={s} index={i} />
            </li>
          ))}
        </ol>

        {error && (
          <div className="space-y-2 rounded-xl border border-danger/40 bg-danger/5 p-4 text-center text-sm">
            <p>{error}</p>
            <Button variant="outline" onClick={onRetry}>
              Try again
            </Button>
          </div>
        )}

        {nextSection ? (
          <Button className="h-12 w-full" onClick={onContinue} disabled={loading || !!error}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Getting {label} ready…
              </>
            ) : (
              <>
                Continue to {label} <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        ) : (
          <Button className="h-12 w-full" onClick={onFinish}>
            Finish and leave the exam <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
