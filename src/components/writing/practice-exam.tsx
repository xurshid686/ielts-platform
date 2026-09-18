"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Clock, Download, Loader2, PenLine, Send } from "lucide-react";
import { savePracticeAnswer } from "@/app/actions/writing-practice";
import { WritingPrompt } from "@/components/mock/writing-prompt";
import { TopicChip } from "@/components/writing/topic-chip";
import { WritingWorkspace } from "@/components/writing/writing-workspace";
import { Button } from "@/components/ui/button";
import { spendLine, wordsLine } from "@/lib/ielts/writing-prompt";
import { TASK1_MIN_WORDS, TASK2_MIN_WORDS, countWords } from "@/lib/mock-shared";
import { cn } from "@/lib/utils";

const AUTOSAVE_MS = 20_000;

// Inspera tokens (see the reading/listening players).
const TEAL = "#2a6c96";

export type PracticeKind = "task1" | "task2" | "full";

/** The advisory allowance — mirrors minutesOf() in lib/writing-practice.ts. */
const MINUTES: Record<PracticeKind, number> = { task1: 20, task2: 40, full: 60 };
const BADGE: Record<PracticeKind, string> = { task1: "Practice · Task 1", task2: "Practice · Task 2", full: "Practice · Full test" };

/**
 * One IELTS Writing practice sitting on the student's own time: a Task 1, a
 * Task 2, or a Full test (both, with the mock's Part 1 / Part 2 footer).
 *
 * THIS IS NOT THE MOCK, and the differences are the point:
 *
 * - **Nothing happens when the clock reaches zero.** It counts down from the
 *   real allowance (20 / 40 / 60 minutes), it stops at 00:00, and that is all:
 *   the textarea stays live, Submit stays enabled, nothing is handed in. The
 *   mock does the opposite on all three counts — do not copy that branch back
 *   in here.
 * - No ExamGuard, so no fullscreen, no device gate, no second-tab block.
 * - No violations: leaving the page, pasting and reloading are all fine.
 * - No band, no marking, no email. The student gets their own PDF and their
 *   own history, and that is the whole product.
 */
export function PracticeExam({
  kind,
  attemptId,
  topic,
  prompt,
  imageUrl,
  topic2,
  prompt2,
  studentName,
  initialAnswer,
  initialAnswer2,
  initialRevision,
  startedAt,
}: {
  kind: PracticeKind;
  attemptId: string;
  /** Task 2's topic, or the Task 1 chart kind. */
  topic: string | null;
  prompt: string;
  /** Task 1 / Full: the signed picture URL. */
  imageUrl: string | null;
  /** Full only: the paired Task 2. */
  topic2: string | null;
  prompt2: string | null;
  studentName: string;
  initialAnswer: string;
  initialAnswer2: string;
  initialRevision: number;
  /** ISO. The advisory clock counts from here. */
  startedAt: string;
}) {
  const full = kind === "full";
  // In a Full test, part 1 is Task 1 (answer) and part 2 is Task 2 (answer2).
  const [part, setPart] = useState<1 | 2>(1);
  const [answer, setAnswer] = useState(initialAnswer);
  const [answer2, setAnswer2] = useState(initialAnswer2);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const now = useNow();
  const revision = useRef(initialRevision);
  const latest = useRef({ answer, answer2 });
  const lastSent = useRef({ answer: initialAnswer, answer2: initialAnswer2 });
  const finished = useRef(false);
  useEffect(() => {
    latest.current = { answer, answer2 };
  }, [answer, answer2]);

  const send = useCallback(
    async (final: boolean) => {
      if (finished.current) return;
      const { answer: t1, answer2: t2 } = latest.current;
      if (!final && t1 === lastSent.current.answer && t2 === lastSent.current.answer2) return;
      const res = await savePracticeAnswer(attemptId, t1, revision.current, final, full ? t2 : null);
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
      lastSent.current = { answer: t1, answer2: t2 };
      setSavedAt(res.savedAt);
      if (res.submitted) {
        finished.current = true;
        setDone(true);
      }
    },
    [attemptId, full],
  );

  // The autosave. The clock is a separate, external-store subscription (useNow).
  useEffect(() => {
    const save = setInterval(() => void send(false), AUTOSAVE_MS);
    return () => clearInterval(save);
  }, [send]);

  // Best effort only: a save on the way out is a convenience, and the periodic
  // autosave above is what actually protects the work.
  useEffect(() => {
    function onBeforeUnload() {
      const { answer: t1, answer2: t2 } = latest.current;
      if (finished.current || (t1 === lastSent.current.answer && t2 === lastSent.current.answer2)) return;
      void send(false);
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [send]);

  const words1 = countWords(answer);
  const words2 = countWords(answer2);

  if (done) {
    return (
      <DoneScreen
        topic={topic}
        summary={full ? `Task 1: ${words1} words · Task 2: ${words2} words` : `${words1} words`}
        onPdf={async () => {
          const { downloadPracticePdf } = await import("@/lib/writing-practice-pdf");
          await downloadPracticePdf({
            studentName,
            kind,
            topic,
            prompt,
            imageUrl,
            answer: latest.current.answer,
            prompt2,
            topic2,
            answer2: latest.current.answer2,
            submittedAt: savedAt,
          });
        }}
      />
    );
  }

  // Which task is on screen: Task 1 alone, Task 2 alone, or the Full test's part.
  const task: 1 | 2 = kind === "task2" ? 2 : kind === "task1" ? 1 : part;
  const onTask2Half = full && part === 2;
  const minutes = MINUTES[kind];

  // Clamped to [0, allowance] — started_at is the DATABASE's clock, which can
  // run a second ahead of the browser's — and nothing reads it but the badge
  // and the note below.
  const remaining =
    now == null
      ? minutes * 60_000
      : Math.min(minutes * 60_000, Math.max(0, new Date(startedAt).getTime() + minutes * 60_000 - now));
  const overtime = remaining === 0;

  return (
    <div
      data-practice-root
      data-practice-kind={kind}
      className="flex h-full min-h-0 flex-col bg-white text-black"
      style={{ fontFamily: "Arial, sans-serif" }}
    >
      <div className="grid h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-border bg-surface px-3 text-foreground">
        <div className="flex min-w-0 items-center gap-2" style={{ fontFamily: "var(--font-sans, inherit)" }}>
          {/* There is no fullscreen to escape and no sitting to abandon: leaving
              keeps the draft, and the question can be reopened any time. */}
          <Link
            href={`/writing?kind=${kind}`}
            aria-label="Back to the question list"
            title="Your draft is saved"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <span className="hidden shrink-0 rounded-md bg-surface-2 px-2 py-0.5 text-xs font-semibold text-muted sm:inline">
            {BADGE[kind]}
          </span>
          <TopicChip topic={onTask2Half ? topic2 : topic} className="hidden md:inline-flex" />
        </div>

        <div className="flex justify-center">
          <span
            role="timer"
            aria-label="Suggested time left"
            title={`The exam allowance is ${minutes} minutes. Nothing happens when it runs out — this is practice.`}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-mono text-lg font-bold tabular-nums",
              overtime ? "bg-surface-2 text-muted" : "bg-surface-2 text-foreground",
            )}
          >
            <Clock className="h-4 w-4" />
            {clock(remaining)}
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
        <p className="font-bold">{full ? `Part ${part}` : `Writing Task ${task}`}</p>
        <p>
          {spendLine(task)} {wordsLine(task)}
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
        promptLabel={`Writing Task ${task}`}
        prompt={
          onTask2Half ? (
            <WritingPrompt task={2} raw={prompt2} />
          ) : (
            <WritingPrompt task={task} raw={prompt} imageUrl={task === 1 ? imageUrl : null} />
          )
        }
        value={onTask2Half ? answer2 : answer}
        onChange={onTask2Half ? setAnswer2 : setAnswer}
        words={onTask2Half ? words2 : words1}
        minWords={task === 1 ? TASK1_MIN_WORDS : TASK2_MIN_WORDS}
        answerLabel={full ? `Your answer to Task ${part}` : "Your answer"}
        answerKey={full ? part : undefined}
      />

      {/* Part footer — the mock's (writing-exam.tsx), copied rather than shared:
          that screen is live exam code and stays untouched. */}
      {full && (
        <nav className="flex h-14 shrink-0 bg-white shadow-[0_0_45px_rgba(0,0,0,0.15)]" aria-label="Parts">
          {([1, 2] as const).map((n) => (
            <button
              key={n}
              onClick={() => setPart(n)}
              aria-current={part === n ? "page" : undefined}
              className="flex flex-1 items-center justify-center gap-2 text-[16px]"
              style={{
                background: part === n ? "#ffffff" : "#efefef",
                borderTop: `3px solid ${part === n ? TEAL : "transparent"}`,
                fontWeight: part === n ? 700 : 400,
              }}
            >
              Part {n}
              <span className="text-sm font-normal text-[#535353] tabular-nums">{n === 1 ? words1 : words2} words</span>
            </button>
          ))}
        </nav>
      )}

      {confirming && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 text-foreground shadow-elevated">
            <h2 className="font-semibold">Submit this practice?</h2>
            <p className="mt-1 text-sm text-muted">
              {full ? `Task 1: ${words1} words · Task 2: ${words2} words.` : `${words1} words.`} It is saved to your
              account and you can download it as a PDF, but you cannot keep editing this attempt — you can
              always start the question again.
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

/**
 * The wall clock, as an external store rather than state seeded from Date.now().
 *
 * Unlike the mock's Writing screen — only ever reached by a CLIENT transition
 * inside SectionFlow — this page is SERVER-rendered, so a `useState(() =>
 * Date.now())` made the server's clock text and the browser's first render
 * disagree and React threw a hydration error (#418) on every sitting. Seeding it
 * null and filling it in from an effect is the other obvious fix and the repo's
 * lint rejects it (setState in an effect body, the admin-discipline rule).
 *
 * `getServerSnapshot` returns null, so both renders agree; the snapshot is
 * bucketed to the second so it is stable between ticks, as the store contract
 * requires.
 */
function useNow(): number | null {
  return useSyncExternalStore(
    (onChange) => {
      const id = setInterval(onChange, 1000);
      return () => clearInterval(id);
    },
    () => Math.floor(Date.now() / 1000) * 1000,
    () => null,
  );
}

function clock(ms: number) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function DoneScreen({
  topic,
  summary,
  onPdf,
}: {
  topic: string | null;
  summary: string;
  onPdf: () => Promise<void>;
}) {
  const [making, setMaking] = useState(false);
  return (
    <div data-practice-root className="flex h-full items-center justify-center bg-background px-4 text-foreground">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/10 text-success">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <h1 className="mt-4 text-xl font-bold">Practice submitted</h1>
        <div className="mt-3 flex justify-center">
          <TopicChip topic={topic} />
        </div>
        <p className="mt-3 text-sm text-muted">
          {summary}, saved to your account. Download a PDF of your writing to keep, or to send to a
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
