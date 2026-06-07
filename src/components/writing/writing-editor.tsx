"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Clock, Sparkles, Loader2, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WritingFeedbackView } from "@/components/writing/writing-feedback";
import { submitWriting, type SubmitWritingResult } from "@/app/actions/writing";
import type { WritingPrompt } from "@/lib/ielts/writing-prompts";

function countWords(s: string) {
  const t = s.trim();
  return t ? t.split(/\s+/).length : 0;
}
function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  return `${m}:${String(sec % 60).padStart(2, "0")}`;
}

export function WritingEditor({ prompt }: { prompt: WritingPrompt }) {
  const router = useRouter();
  const storageKey = `ielts_writing_${prompt.id}`;
  const [text, setText] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitWritingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  // Restore any local draft (client-only; can't be a lazy initializer because
  // localStorage is unavailable during SSR).
  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved) setText(saved);
  }, [storageKey]);

  // Autosave draft locally + run the timer once typing starts.
  useEffect(() => {
    const id = setInterval(() => {
      if (started.current && !result) setSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [result]);

  function onChange(v: string) {
    started.current = true;
    setText(v);
    localStorage.setItem(storageKey, v);
  }

  const words = countWords(text);
  const overMin = words >= prompt.minWords;

  async function submit() {
    setSubmitting(true);
    setError(null);
    const res = await submitWriting(prompt.id, text);
    setSubmitting(false);
    setResult(res);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    localStorage.removeItem(storageKey);
    router.refresh();
  }

  if (result?.ok) {
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <button
          onClick={() => router.push("/writing")}
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Writing
        </button>
        <div className="flex items-center gap-2 rounded-xl border border-success/30 bg-success/5 px-4 py-3 text-sm">
          <Flame className="h-4 w-4 text-warning" /> Saved! {result.streak}-day streak · {result.xp} XP
        </div>
        {result.feedback ? (
          <WritingFeedbackView feedback={result.feedback} />
        ) : (
          <div className="rounded-2xl border border-border bg-surface p-6 text-center">
            <p className="font-medium">Writing saved ✅</p>
            <p className="mt-1 text-sm text-muted">{result.aiError}</p>
          </div>
        )}
        <Button variant="outline" onClick={() => router.push("/writing")}>
          Back to Writing
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push("/writing")}
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Writing
        </button>
        <span className="inline-flex items-center gap-1.5 text-sm text-muted tabular-nums">
          <Clock className="h-4 w-4" /> {fmt(seconds)} / {prompt.minutes}:00
        </span>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-5 shadow-soft">
        <span className="inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-primary">
          {prompt.task === "task1" ? "Task 1" : "Task 2"}
        </span>
        <h1 className="mt-2 text-lg font-bold">{prompt.title}</h1>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{prompt.prompt}</p>
      </div>

      <textarea
        value={text}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Write your answer here…"
        className="min-h-[320px] w-full rounded-2xl border border-border bg-surface p-4 text-sm leading-relaxed shadow-soft outline-none focus:border-primary/40 focus:ring-2 focus:ring-ring/20"
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className={`text-sm tabular-nums ${overMin ? "text-success" : "text-muted"}`}>
          {words} words{" "}
          <span className="text-muted">/ {prompt.minWords} min{overMin ? " ✓" : ""}</span>
        </span>
        <Button onClick={submit} disabled={submitting || words < 20}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {submitting ? "Assessing…" : "Submit for AI feedback"}
        </Button>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
