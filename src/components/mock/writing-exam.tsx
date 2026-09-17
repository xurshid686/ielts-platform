"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Download, Loader2, Send } from "lucide-react";
import { reportWritingViolation, saveMockWriting } from "@/app/actions/mock";
import { leaveExamFullscreen, useExamReport } from "@/components/mock/exam-guard";
import { ExamClock, ExamTopBar } from "@/components/mock/exam-top-bar";
import { beaconDraft } from "@/components/mock/mock-runner";
import { WritingPrompt } from "@/components/mock/writing-prompt";
import { WritingWorkspace } from "@/components/writing/writing-workspace";
import { Button } from "@/components/ui/button";
import { spendLine, wordsLine } from "@/lib/ielts/writing-prompt";
import {
  PASTE_VIOLATION_WORDS,
  SWITCH_VIOLATION_MS,
  TASK1_MIN_WORDS,
  TASK2_MIN_WORDS,
  WRITING_MAX_VIOLATIONS,
  countWords,
} from "@/lib/mock-shared";

const AUTOSAVE_MS = 20_000;

/**
 * Writing, Tasks 1 and 2, on one clock — v3, laid out like the computer-delivered
 * test: part rubric on top, the task on the left, the answer on the right with a
 * draggable divider, Part 1 / Part 2 at the bottom.
 *
 * The clock's source of truth is the SERVER: `deadline` is writing_started_at +
 * the mock's minutes, and saveWriting() refuses new text once it has passed.
 *
 * VIOLATIONS (owner, Writing only): the page being away (another tab or app)
 * for 5 s or more, a paste of more than 10 words, and a reload (counted by the
 * server when the page renders). The SERVER counts; the third hands the writing
 * in as it stands. Leaving fullscreen alone is not a violation — ExamGuard hides
 * the test until the student returns.
 */
export type WritingProps = {
  mockId: string;
  title: string;
  /** For the student's PDF copy. */
  studentName: string;
  /** Epoch ms. */
  deadline: number;
  initialTask1: string;
  initialTask2: string;
  task1Prompt: string;
  task2Prompt: string;
  task1ImageUrl: string | null;
  /** Violations already on record (a reload included). */
  initialViolations: number;
  /** The server handed the writing in while rendering (the reload was the third violation). */
  autoSubmitted?: boolean;
  /** The section flow's last-moment save hook (v2.1). */
  flushRef?: React.MutableRefObject<(() => void) | null>;
};

/** Writing inside the section flow's ExamGuard (0052; top bar + centered clock since 0054). */
export function WritingSection(props: WritingProps) {
  return <WritingBody {...props} />;
}

type Done = null | "normal" | "violations";

// Inspera tokens (see the reading/listening players).
const TEAL = "#2a6c96";

function WritingBody({
  mockId,
  title,
  studentName,
  deadline,
  initialTask1,
  initialTask2,
  task1Prompt,
  task2Prompt,
  task1ImageUrl,
  initialViolations,
  autoSubmitted,
  flushRef,
}: WritingProps) {
  const router = useRouter();
  const report = useExamReport();
  const [tab, setTab] = useState<1 | 2>(1);
  const [task1, setTask1] = useState(initialTask1);
  const [task2, setTask2] = useState(initialTask2);
  const [now, setNow] = useState(() => Date.now());
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done>(autoSubmitted ? "violations" : null);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  /** "Violation N of 3" box; null = hidden. Shown for the reload violation too. */
  const [notice, setNotice] = useState<number | null>(
    !autoSubmitted && initialViolations > 0 ? initialViolations : null,
  );

  // Latest text for the timers, without re-arming them on every keystroke.
  const latest = useRef({ task1, task2 });
  useEffect(() => {
    latest.current = { task1, task2 };
  }, [task1, task2]);
  const lastSent = useRef({ task1: initialTask1, task2: initialTask2 });
  const finished = useRef(!!autoSubmitted);

  const send = useCallback(
    async (final: boolean) => {
      if (finished.current) return;
      const { task1: t1, task2: t2 } = latest.current;
      if (!final && t1 === lastSent.current.task1 && t2 === lastSent.current.task2) return;
      const res = await saveMockWriting(mockId, t1, t2, final);
      if (!res.ok) {
        if (/already been submitted/i.test(res.error)) {
          finished.current = true;
          setDone((d) => d ?? "normal");
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
        setDone("normal");
      }
    },
    [mockId],
  );

  // ---- violations --------------------------------------------------------
  const violate = useCallback(
    async (kind: "switch" | "paste", detail: { ms?: number; words?: number; task?: 1 | 2 }) => {
      if (finished.current) return;
      try {
        const { task1: t1, task2: t2 } = latest.current;
        const res = await reportWritingViolation(mockId, kind, detail, t1, t2);
        if (!res.ok) return;
        if (res.submitted) {
          finished.current = true;
          setConfirming(false);
          setNotice(null);
          setDone(res.violations >= WRITING_MAX_VIOLATIONS ? "violations" : "normal");
          return;
        }
        (document.activeElement as HTMLElement | null)?.blur?.();
        setNotice(res.violations);
      } catch {
        /* offline: the reload check still counts on the server */
      }
    },
    [mockId],
  );

  // Another tab or app: counts once the page has been away for 5 s, once per departure.
  useEffect(() => {
    let since: number | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const leave = () => {
      if (finished.current || since != null) return;
      since = Date.now();
      timer = setTimeout(() => {
        if (since != null) void violate("switch", { ms: Date.now() - since });
      }, SWITCH_VIOLATION_MS);
    };
    const back = () => {
      if (document.visibilityState === "hidden" || !document.hasFocus()) return;
      since = null;
      if (timer) clearTimeout(timer);
      timer = null;
    };
    const onVisibility = () => (document.visibilityState === "hidden" ? leave() : back());
    window.addEventListener("blur", leave);
    window.addEventListener("focus", back);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("blur", leave);
      window.removeEventListener("focus", back);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [violate]);

  function onPasted(words: number) {
    if (words >= 5) report({ type: "paste", words, task: tab });
    if (words > PASTE_VIOLATION_WORDS) {
      const task = tab;
      // After the paste lands, so a third violation hands in the text with it.
      setTimeout(() => void violate("paste", { words, task }), 60);
    }
  }

  // ---- clock + autosave -------------------------------------------------
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

  useEffect(() => {
    if (timeUp && !finished.current) void send(true);
  }, [timeUp, send]);

  // The section flow's last-moment save on pagehide / Leave (v2.1).
  useEffect(() => {
    if (!flushRef) return;
    flushRef.current = () => {
      if (finished.current) return;
      beaconDraft({ mockId, section: "writing", task1: latest.current.task1, task2: latest.current.task2 });
    };
    return () => {
      flushRef.current = null;
    };
  }, [flushRef, mockId]);

  // Always ask before a reload or close while the writing is open (owner, v2.1).
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (finished.current) return;
      const { task1: t1, task2: t2 } = latest.current;
      if (t1 !== lastSent.current.task1 || t2 !== lastSent.current.task2) void send(false);
      e.preventDefault();
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [send]);

  if (done) {
    return (
      <DoneScreen
        byViolations={done === "violations"}
        onPdf={() =>
          downloadPdf({ mockTitle: title, studentName, task1Prompt, task2Prompt, task1ImageUrl, ...latest.current })
        }
        onBack={() => {
          // The sitting is over: leave fullscreen on purpose before going back.
          void leaveExamFullscreen().then(() => router.push(`/mock/${mockId}`));
        }}
      />
    );
  }

  const words1 = countWords(task1);
  const words2 = countWords(task2);
  const words = tab === 1 ? words1 : words2;
  const min = tab === 1 ? TASK1_MIN_WORDS : TASK2_MIN_WORDS;

  return (
    <div className="flex h-full flex-col bg-white text-black" style={{ fontFamily: "Arial, sans-serif" }}>
      <ExamTopBar
        label="Writing"
        title={title}
        center={<ExamClock remainingMs={remaining} />}
        right={
          <>
            <span className="hidden text-xs text-muted sm:inline">{pending ? "Submitting…" : savedAt ? "Saved" : ""}</span>
            <Button size="sm" className="h-9" onClick={() => setConfirming(true)} disabled={pending || timeUp}>
              <Send className="h-4 w-4" /> Submit writing
            </Button>
          </>
        }
      />

      {/* Part rubric band */}
      <div className="shrink-0 border-b border-[#d5d5d5] bg-[#F1F2EC] px-6 py-3 text-[16px] leading-snug">
        <p className="font-bold">Part {tab}</p>
        <p>
          {spendLine(tab)} {wordsLine(tab)}
        </p>
      </div>

      {error && (
        <p className="shrink-0 border-b border-danger/30 bg-danger/5 px-6 py-2 text-sm text-danger">{error}</p>
      )}

      <WritingWorkspace
        promptLabel={`Writing Task ${tab}`}
        prompt={
          <WritingPrompt
            task={tab}
            raw={tab === 1 ? task1Prompt : task2Prompt}
            imageUrl={tab === 1 ? task1ImageUrl : null}
          />
        }
        value={tab === 1 ? task1 : task2}
        onChange={(next) => (tab === 1 ? setTask1(next) : setTask2(next))}
        words={words}
        minWords={min}
        disabled={timeUp}
        answerLabel={`Your answer to Task ${tab}`}
        answerKey={tab}
        onPasteText={(text) => onPasted(countWords(text))}
      />

      {/* Part footer */}
      <nav className="flex h-14 shrink-0 bg-white shadow-[0_0_45px_rgba(0,0,0,0.15)]" aria-label="Parts">
        {([1, 2] as const).map((n) => (
          <button
            key={n}
            onClick={() => setTab(n)}
            aria-current={tab === n ? "page" : undefined}
            className="flex flex-1 items-center justify-center gap-2 text-[16px]"
            style={{
              background: tab === n ? "#ffffff" : "#efefef",
              borderTop: `3px solid ${tab === n ? TEAL : "transparent"}`,
              fontWeight: tab === n ? 700 : 400,
            }}
          >
            Part {n}
            <span className="text-sm font-normal text-[#535353] tabular-nums">{n === 1 ? words1 : words2} words</span>
          </button>
        ))}
      </nav>

      {notice != null && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4" role="alertdialog" aria-modal="true" aria-label="Violation">
          <div className="w-full max-w-md rounded-2xl border border-danger/40 bg-surface p-6 text-center text-foreground shadow-elevated">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-danger/10 text-danger">
              <AlertTriangle className="h-7 w-7" />
            </div>
            <h2 className="mt-4 text-lg font-bold">
              Violation {Math.min(notice, WRITING_MAX_VIOLATIONS)} of {WRITING_MAX_VIOLATIONS}
            </h2>
            <p className="mt-2 text-sm text-muted">
              Leaving the exam for another tab or app, pasting text and reloading the page are violations.{" "}
              <b className="text-foreground">
                {WRITING_MAX_VIOLATIONS - notice <= 1
                  ? "One more and your writing is submitted automatically."
                  : `After ${WRITING_MAX_VIOLATIONS} your writing is submitted automatically.`}
              </b>{" "}
              The clock is still running.
            </p>
            <Button className="mt-5 h-11 w-full text-base" onClick={() => setNotice(null)} autoFocus>
              Continue writing
            </Button>
          </div>
        </div>
      )}

      {confirming && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 text-foreground shadow-elevated">
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

async function downloadPdf(input: Parameters<typeof import("@/lib/writing-pdf").downloadWritingPdf>[0]) {
  const { downloadWritingPdf } = await import("@/lib/writing-pdf");
  await downloadWritingPdf(input);
}

function DoneScreen({ byViolations, onPdf, onBack }: { byViolations: boolean; onPdf: () => Promise<void>; onBack: () => void }) {
  const [making, setMaking] = useState(false);
  return (
    <div className="flex h-full items-center justify-center bg-background px-4">
      <div className="w-full max-w-md text-center">
        <div
          className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${byViolations ? "bg-danger/10 text-danger" : "bg-success/10 text-success"}`}
        >
          {byViolations ? <AlertTriangle className="h-7 w-7" /> : <CheckCircle2 className="h-7 w-7" />}
        </div>
        <h1 className="mt-4 text-xl font-bold">
          {byViolations ? "Your writing was submitted automatically" : "Mock exam submitted"}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {byViolations
            ? `There were ${WRITING_MAX_VIOLATIONS} violations, so your writing was handed in as it was. Your teacher will see why. `
            : "All three sections are in. "}
          Your teacher will mark your writing and release your full result. When they do,{" "}
          <b className="text-foreground">we email it to you with your results paper attached</b> — and you will get a
          notification here too.
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
          <Button onClick={onBack}>Back to the mock</Button>
        </div>
      </div>
    </div>
  );
}
