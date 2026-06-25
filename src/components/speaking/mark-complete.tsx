"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import { setSpeakingCompletion } from "@/app/actions/speaking-completion";

export function MarkComplete({
  questionId,
  initialCompleted,
}: {
  questionId: string;
  initialCompleted: boolean;
}) {
  const [completed, setCompleted] = useState(initialCompleted);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function apply(next: boolean) {
    setError(null);
    setConfirming(false);
    startTransition(async () => {
      const res = await setSpeakingCompletion(questionId, next);
      if (res.ok) setCompleted(res.completed);
      else setError(res.error);
    });
  }

  if (completed) {
    return (
      <div className="rounded-2xl border border-emerald-600/30 bg-emerald-600/5 p-5">
        <p className="flex items-center gap-2 font-semibold text-emerald-600">
          <CheckCircle2 className="h-5 w-5" /> You've completed this topic
        </p>
        <button
          type="button"
          onClick={() => apply(false)}
          disabled={pending}
          className="mt-2 text-xs font-medium text-muted underline hover:text-foreground disabled:opacity-60"
        >
          {pending ? "Updating…" : "Undo"}
        </button>
        {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Circle className="h-4 w-4" /> Mark as completed
        </button>
      ) : (
        <div>
          <p className="font-medium">
            Did you really finish practising this topic?
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => apply(true)}
              disabled={pending}
              className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
            >
              {pending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Saving…
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" /> Yes, mark it done
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="inline-flex items-center rounded-full border border-border px-5 py-2 text-sm font-medium hover:bg-surface-2"
            >
              Not yet
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
    </div>
  );
}
