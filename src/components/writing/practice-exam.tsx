"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Clock, Download, Loader2, PenLine, Send } from "lucide-react";
import { savePracticeAnswer } from "@/app/actions/writing-practice";
import { WritingPrompt } from "@/components/mock/writing-prompt";
import { TopicChip } from "@/components/writing/topic-chip";
import { WritingWorkspace } from "@/components/writing/writing-workspace";
import { Button } from "@/components/ui/button";
import { TASK2_MINUTES, spendLine, wordsLine } from "@/lib/ielts/writing-prompt";
import { TASK2_MIN_WORDS, countWords } from "@/lib/mock-shared";
import { cn } from "@/lib/utils";

const AUTOSAVE_MS = 20_000;

/**
 * One IELTS Writing Task 2 question, on the student's own time.
 *
 * THIS IS NOT THE MOCK, and the differences are the point:
 *
 * - **Nothing happens when the clock reaches zero.** It counts down from 40
 *   minutes because that is the real allowance, it stops at 00:00, and that is
 *   all: the textarea stays live, Submit stays enabled, nothing is handed in.
 *   The mock does the opposite on all three counts — do not copy that branch
 *   back in here.
 * - No ExamGuard, so no fullscreen, no device gate, no second-tab block.
 * - No violations: leaving the page, pasting and reloading are all fine.
 * - No band, no marking, no email. The student gets their own PDF and their
 *   own history, and that is the whole product.
 */
export function PracticeExam({
  attemptId,
  topic,
  prompt,
  studentName,
  initialAnswer,
  initialRevision,
  startedAt,
}: {
  attemptId: string;
  topic: string;
  prompt: string;
  studentName: string;
  initialAnswer: string;
  initialRevision: number;
  /** ISO. The advisory clock counts 40 minutes from here. */
  startedAt: string;
}) {
  const [answer, setAnswer] = useState(initialAnswer);
  const [now, setNow] = useState(() => Date.now());
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const revision = useRef(initialRevision);
  const latest = useRef(answer);
  const lastSent = useRef(initialAnswer);
  const finished = useRef(false);
  useEffect(() => {
    latest.current = answer;
  }, [answer]);

  const send = useCallback(
    async (final: boolean) => {
      if (finished.current) return;
      const text = latest.current;
      if (!final && text === lastSent.current) return;
      const res = await savePracticeAnswer(attemptId, text, revision.current, final);
      if (!res.ok) {
        if (/already been submitted/i.test(res.error)) {
          finished.current = true;
          setDone(true);
          return;
        }
        setError(res.error);
        return;
      }
      setError(null);
      revision.current = res.revision;
      lastSent.current = text;
      setSavedAt(res.savedAt);
      if (res.submitted) {
        finished.current = true;
        setDone(true);
      }
    },
    [attemptId],
  );

  // Clock + autosave. The clock is decoration; the autosave is not.
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const save = setInterval(() => void send(false), AUTOSAVE_MS);
    return () => {
      clearInterval(tick);
      clearInterval(save);
    };
  }, [send]);

  // Best effort only: a save on the way out is a convenience, and the periodic
  // autosave above is what actually protects the work.
  useEffect(() => {
    function onBeforeUnload() {
      if (finished.current || latest.current === lastSent.current) return;
      void send(false);
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [send]);

  const words = countWords(answer);

  if (done) {
    return (
      <DoneScreen
        topic={topic}
        words={words}
        onPdf={async () => {
          const { downloadPracticePdf } = await import("@/lib/writing-practice-pdf");
          await downloadPracticePdf({
            studentName,
            topic,
            prompt,
            answer: latest.current,
            words: countWords(latest.current),
            submittedAt: savedAt,
          });
        }}
      />
    );
  }

  // Clamped at zero, and nothing reads it but the badge below.
  const remaining = Math.max(0, new Date(startedAt).getTime() + TASK2_MINUTES * 60_000 - now);
  const overtime = remaining === 0;

  return (
    <div className="flex h-full min-h-0 flex-col bg-white text-black" style={{ fontFamily: "Arial, sans-serif" }}>
      <div className="grid h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-border bg-surface px-3 text-foreground">
        <div className="flex min-w-0 items-center gap-2" style={{ fontFamily: "var(--font-sans, inherit)" }}>
          {/* There is no fullscreen to escape and no sitting to abandon: leaving
              keeps the draft, and the question can be reopened any time. */}
          <Link
            href="/writing"
            aria-label="Back to the question list"
            title="Your draft is saved"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <span className="hidden shrink-0 rounded-md bg-surface-2 px-2 py-0.5 text-xs font-semibold text-muted sm:inline">
            Practice · Task 2
          </span>
          <TopicChip topic={topic} className="hidden md:inline-flex" />
        </div>

        <div className="flex justify-center">
          <span
            role="timer"
            aria-label="Suggested time left"
            title="The exam allowance for Task 2. Nothing happens when it runs out — this is practice."
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-mono text-lg font-bold tabular-nums",
              overtime ? "bg-surface-2 text-muted" : "bg-surface-2 text-foreground",
            )}
          >
            <Clock className="h-4 w-4" />
            {overtime ? "00:00" : clock(remaining)}
          </span>
        </div>

        <div className="flex min-w-0 items-center justify-end gap-2">
          <span className="hidden text-xs text-muted sm:inline">
            {pending ? "Submitting…" : savedAt ? "Saved" : ""}
          </span>
          <Button size="sm" className="h-9" onClick={() => setConfirming(true)} disabled={pending}>
            <Send className="h-4 w-4" /> Submit
          </Button>
        </div>
      </div>

      <div className="shrink-0 border-b border-[#d5d5d5] bg-[#F1F2EC] px-6 py-3 text-[16px] leading-snug">
        <p className="font-bold">Writing Task 2</p>
        <p>
          {spendLine(2)} {wordsLine(2)}
        </p>
        {overtime && (
          <p className="mt-1 text-sm text-[#535353]">
            You are past the exam allowance — keep going as long as you like, this is practice.
          </p>
        )}
      </div>

      {error && (
        <p className="shrink-0 border-b border-danger/30 bg-danger/5 px-6 py-2 text-sm text-danger">{error}</p>
      )}

      <WritingWorkspace
        promptLabel="Writing Task 2"
        prompt={<WritingPrompt task={2} raw={prompt} />}
        value={answer}
        onChange={setAnswer}
        words={words}
        minWords={TASK2_MIN_WORDS}
        answerLabel="Your answer"
      />

      {confirming && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 text-foreground shadow-elevated">
            <h2 className="font-semibold">Submit this practice?</h2>
            <p className="mt-1 text-sm text-muted">
              {words} words. It is saved to your account and you can download it as a PDF, but you
              cannot keep editing this attempt — you can always start the question again.
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

function clock(ms: number) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function DoneScreen({ topic, words, onPdf }: { topic: string; words: number; onPdf: () => Promise<void> }) {
  const [making, setMaking] = useState(false);
  return (
    <div className="flex h-full items-center justify-center bg-background px-4 text-foreground">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/10 text-success">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <h1 className="mt-4 text-xl font-bold">Practice submitted</h1>
        <div className="mt-3 flex justify-center">
          <TopicChip topic={topic} />
        </div>
        <p className="mt-3 text-sm text-muted">
          {words} words, saved to your account. Download a PDF of your essay to keep, or to send to a
          teacher — practice is not marked here.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button
            variant="outline"
            disabled={making}
            onClick={() => {
              setMaking(true);
              void onPdf().finally(() => setMaking(false));
            }}
          >
            {making ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download PDF
          </Button>
          <Button asChild>
            <Link href="/writing">
              <PenLine className="h-4 w-4" /> Write another
            </Link>
          </Button>
        </div>
        <p className="mt-4 text-sm">
          <Link href="/writing/history" className="text-primary underline underline-offset-4">
            My practice history
          </Link>
        </p>
      </div>
    </div>
  );
}
