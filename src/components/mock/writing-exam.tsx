"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, Loader2, Send } from "lucide-react";
import { saveMockWriting } from "@/app/actions/mock";
import { Button } from "@/components/ui/button";
import { TASK1_MIN_WORDS, TASK2_MIN_WORDS, countWords } from "@/lib/mock-shared";
import { cn } from "@/lib/utils";

const AUTOSAVE_MS = 20_000;

/**
 * Writing, Tasks 1 and 2, on one clock.
 *
 * The clock's source of truth is the SERVER: `deadline` is writing_started_at +
 * the mock's minutes, and saveWriting() refuses new text once it has passed.
 * This component only mirrors it — counting down, autosaving every 20 s, and
 * handing in the moment it reaches zero — so closing the tab and coming back
 * later resumes the same clock rather than a fresh one.
 */
export function WritingExam({
  mockId,
  deadline,
  initialTask1,
  initialTask2,
  task1Prompt,
  task2Prompt,
  task1ImageUrl,
}: {
  mockId: string;
  /** Epoch ms. */
  deadline: number;
  initialTask1: string;
  initialTask2: string;
  task1Prompt: string;
  task2Prompt: string;
  task1ImageUrl: string | null;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<1 | 2>(1);
  const [task1, setTask1] = useState(initialTask1);
  const [task2, setTask2] = useState(initialTask2);
  const [now, setNow] = useState(() => Date.now());
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  // Latest text for the timers, without re-arming them on every keystroke.
  const latest = useRef({ task1, task2 });
  useEffect(() => {
    latest.current = { task1, task2 };
  }, [task1, task2]);
  const lastSent = useRef({ task1: initialTask1, task2: initialTask2 });
  const finished = useRef(false);

  const send = useCallback(
    async (final: boolean) => {
      if (finished.current) return;
      const { task1: t1, task2: t2 } = latest.current;
      if (!final && t1 === lastSent.current.task1 && t2 === lastSent.current.task2) return;
      const res = await saveMockWriting(mockId, t1, t2, final);
      if (!res.ok) {
        if (/already been submitted/i.test(res.error)) {
          finished.current = true;
          setSubmitted(true);
          return;
        }
        setError(res.error);
        return;
      }
      setError(null);
      lastSent.current = { task1: t1, task2: t2 };
      setSavedAt(res.savedAt);
      if (res.submitted) {
        // No router.refresh(): the writing page redirects once writing is
        // submitted, which would replace this confirmation before it is read.
        finished.current = true;
        setSubmitted(true);
      }
    },
    [mockId],
  );

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const save = setInterval(() => void send(false), AUTOSAVE_MS);
    return () => {
      clearInterval(tick);
      clearInterval(save);
    };
  }, [send]);

  const remaining = Math.max(0, deadline - now);
  const timeUp = remaining === 0;

  // Hand in automatically when the clock runs out.
  useEffect(() => {
    if (timeUp && !finished.current) void send(true);
  }, [timeUp, send]);

  // Warn before closing the tab with unsaved text.
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (finished.current) return;
      const { task1: t1, task2: t2 } = latest.current;
      if (t1 !== lastSent.current.task1 || t2 !== lastSent.current.task2) {
        void send(false);
        e.preventDefault();
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [send]);

  if (submitted) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/10 text-success">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <h1 className="mt-4 text-xl font-bold">Mock exam submitted</h1>
        <p className="mt-2 text-sm text-muted">
          All three sections are in. Your teacher will mark your writing and release your full
          result — you will get a notification when it is ready.
        </p>
        <Button className="mt-6" onClick={() => router.push(`/mock/${mockId}`)}>
          Back to the mock
        </Button>
      </div>
    );
  }

  const mins = Math.floor(remaining / 60_000);
  const secs = Math.floor((remaining % 60_000) / 1000);
  const words1 = countWords(task1);
  const words2 = countWords(task2);

  return (
    <div className="space-y-4">
      <div className="sticky top-[env(safe-area-inset-top,0px)] z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface/95 px-4 py-3 shadow-soft backdrop-blur">
        <div className="flex items-center gap-1.5">
          {([1, 2] as const).map((n) => (
            <button
              key={n}
              onClick={() => setTab(n)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium",
                tab === n ? "bg-primary/10 text-primary" : "text-muted hover:bg-surface-2",
              )}
            >
              Task {n}
              <span className="ml-1.5 text-xs tabular-nums opacity-70">
                {n === 1 ? words1 : words2}w
              </span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted">
            {pending ? "Submitting…" : savedAt ? "Saved" : "Autosaves every 20 s"}
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-mono text-sm font-semibold tabular-nums",
              remaining < 5 * 60_000 ? "bg-danger/10 text-danger" : "bg-surface-2",
            )}
          >
            <Clock className="h-4 w-4" />
            {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
          </span>
          <Button size="sm" onClick={() => setConfirming(true)} disabled={pending || timeUp}>
            <Send className="h-4 w-4" /> Submit writing
          </Button>
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-border bg-surface p-5 shadow-soft">
          <h2 className="font-semibold">Writing Task {tab}</h2>
          <p className="mt-1 text-xs text-muted">
            You should spend about {tab === 1 ? 20 : 40} minutes on this task. Write at least{" "}
            {tab === 1 ? TASK1_MIN_WORDS : TASK2_MIN_WORDS} words.
          </p>
          <div className="mt-4 whitespace-pre-wrap text-sm leading-relaxed">
            {tab === 1 ? task1Prompt : task2Prompt}
          </div>
          {tab === 1 && task1ImageUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from private storage
            <img
              src={task1ImageUrl}
              alt="Task 1 visual"
              className="mt-4 max-w-full rounded-lg border border-border bg-white"
            />
          )}
        </section>

        <section className="flex flex-col rounded-2xl border border-border bg-surface p-3 shadow-soft">
          <textarea
            key={tab}
            value={tab === 1 ? task1 : task2}
            onChange={(e) => (tab === 1 ? setTask1(e.target.value) : setTask2(e.target.value))}
            disabled={timeUp}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            placeholder={`Write your answer to Task ${tab} here…`}
            className="min-h-[24rem] w-full flex-1 resize-y rounded-lg bg-surface-2 p-4 text-[15px] leading-relaxed outline-none focus:ring-2 focus:ring-primary/30 lg:min-h-[32rem]"
          />
          <p
            className={cn(
              "mt-2 px-1 text-right text-xs tabular-nums",
              (tab === 1 ? words1 < TASK1_MIN_WORDS : words2 < TASK2_MIN_WORDS)
                ? "text-muted"
                : "text-success",
            )}
          >
            {tab === 1 ? words1 : words2} words
          </p>
        </section>
      </div>

      {confirming && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-elevated">
            <h2 className="font-semibold">Submit your writing?</h2>
            <p className="mt-1 text-sm text-muted">
              Task 1: {words1} words · Task 2: {words2} words. You cannot change it afterwards, and
              this finishes the mock.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirming(false)} disabled={pending}>
                Keep writing
              </Button>
              <Button
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await send(true);
                    setConfirming(false);
                  })
                }
              >
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                Submit
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
