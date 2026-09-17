"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, Loader2, Send } from "lucide-react";
import { saveMockSectionDraft, submitMockSection } from "@/app/actions/mock";
import { Button } from "@/components/ui/button";
import { useExamReport } from "@/components/mock/exam-guard";
import { ExamClock, ExamTopBar } from "@/components/mock/exam-top-bar";

type Answers = Record<string, string>;

function parseAnswers(value: unknown): Answers {
  const out: Answers = {};
  if (!value || typeof value !== "object") return out;
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (/^\d+$/.test(k) && (typeof v === "string" || typeof v === "number")) out[k] = String(v);
  }
  return out;
}

const SNAPSHOT_MS = 15_000;
/** How long to wait for the paper to report a WORKING boot before retrying it. */
const READY_TIMEOUT_MS = 15_000;
/** A time-up submit has nobody to press the button again, so it retries itself. */
const SUBMIT_RETRIES = 5;
const SUBMIT_BACKOFF_MS = 2_000;
/** Automatic reloads of a paper that failed to load, before we ask the student. */
const MAX_PAPER_RETRIES = 3;
const PAPER_BACKOFF_MS = 1_500;

export type PaperSectionProps = {
  mockId: string;
  attemptId: string;
  section: "listening" | "reading";
  testId: string;
  title: string;
  nextLabel: string;
  /** Server deadline, epoch ms. */
  deadline: number;
  draft: Answers;
  audioPos: number;
  /** The section flow's handle on whatever is playing, so leaving fullscreen can pause it. */
  mediaRef: React.MutableRefObject<HTMLMediaElement | null>;
  /** The section flow calls this on pagehide / Leave: a synchronous last save (v2.1). */
  flushRef: React.MutableRefObject<(() => void) | null>;
  /** "Continue to <next>" — the section flow keeps fullscreen across the navigation. */
  onNext: () => void;
};

/** Best-effort save that survives the page going away (sendBeacon). */
export function beaconDraft(body: Record<string, unknown>) {
  try {
    const blob = new Blob([JSON.stringify(body)], { type: "application/json" });
    if (typeof navigator.sendBeacon === "function" && navigator.sendBeacon("/api/mock-draft", blob)) return;
    void fetch("/api/mock-draft", { method: "POST", body: JSON.stringify(body), keepalive: true, headers: { "Content-Type": "application/json" } });
  } catch {
    /* never break the exam */
  }
}

/**
 * The CDI paper for ONE Listening/Reading section, inside the section flow's
 * ExamGuard (0052, reworked 0054).
 *
 * The paper is served through the mock adapter (/api/test-html?mock=<attempt>),
 * which hides its start screen, own timer and results, namespaces its storage
 * and talks to this component:
 *
 *   paper → READY        it has started itself in Mock mode
 *   here  → RESTORE      after a reload, the last server draft (paper → RESTORED)
 *   here  → ACTIVATE     Listening: start the recording
 *   here  → SNAPSHOT     every 15 s (autosave) and on hand-in (paper → SNAPSHOT)
 *   paper → SUBMIT       the student used the paper's own submit
 *   here  → LOCK         handed in; the paper stops reporting
 *
 * The official clock and the Submit button live in the top bar, so a paper
 * whose own submit UI is hidden or broken can still be handed in.
 */
export function PaperSection({
  mockId,
  attemptId,
  section,
  testId,
  title,
  nextLabel,
  deadline,
  draft,
  audioPos,
  mediaRef,
  flushRef,
  onNext,
}: PaperSectionProps) {
  const report = useExamReport();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const handled = useRef(false);
  const maxPos = useRef(audioPos);
  const finalizing = useRef<"auto" | "manual" | null>(null);
  const readySeen = useRef(false);
  // Until the saved answers are back in the paper, an autosave would overwrite
  // the server draft with a blank page. Nothing to restore = safe from the start.
  const restoreDone = useRef(Object.keys(draft).length === 0);
  const activated = useRef(false);
  /** The newest answers the parent has seen — survives a reload of the paper. */
  const liveAnswers = useRef<Answers>(draft);
  const paperRetries = useRef(0);
  /** When the paper first failed, so the outage can be reported with a duration. */
  const outageAt = useRef<number | null>(null);
  const [frameKey, setFrameKey] = useState(0);
  const [paperFailed, setPaperFailed] = useState(false);
  /** Render-visible mirror of `paperRetries` (a ref cannot be read during render). */
  const [retrying, setRetrying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmNote, setConfirmNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const label = section === "listening" ? "Listening" : "Reading";

  const post = useCallback((msg: Record<string, unknown>) => {
    try {
      iframeRef.current?.contentWindow?.postMessage({ source: "IELTS_PLATFORM", ...msg }, window.location.origin);
    } catch {
      /* iframe gone */
    }
  }, []);

  /**
   * Hand the section in.
   *
   * `handled` is set BEFORE the await so a double click cannot submit twice —
   * which means every exit path has to put it back, including a THROW. It used
   * not to: a server action that rejected (a 503 from the host does exactly
   * that) left `handled` true and `saving` true for good, so the student could
   * never submit again and neither could the time-up path. The draft was still
   * graded by the expiry sweep, but the student sat in front of a dead spinner.
   *
   * An `auto` submit has no human to press the button again, so it retries.
   * `submitSection` refuses a second submit and grades the server draft once the
   * clock is past, so retrying is safe.
   */
  const submit = useCallback(
    async (answers: Answers, auto: boolean) => {
      if (handled.current) return;
      handled.current = true;
      setSaving(true);
      setError(null);
      const attempts = auto ? SUBMIT_RETRIES : 1;
      try {
        for (let i = 0; i < attempts; i++) {
          try {
            const res = await submitMockSection(mockId, section, answers);
            if (!res.ok) {
              if (/already been submitted/i.test(res.error)) {
                post({ type: "LOCK" });
                setDone(true);
                return;
              }
              // A refusal is the server's considered answer, not a blip: do not
              // retry it, hand it back to the student.
              handled.current = false;
              finalizing.current = null;
              setError(res.error);
              return;
            }
            post({ type: "LOCK" });
            // No router.refresh(): the section page redirects away from a submitted
            // section, which would unmount this screen before it is read.
            if (auto) setNotice("Time is up — your answers were handed in.");
            setDone(true);
            return;
          } catch {
            // Transport failure. Retry the automatic path; give the manual one
            // back to the student straight away so they can press it again.
            if (i === attempts - 1) throw new Error("transport");
            await new Promise((r) => setTimeout(r, SUBMIT_BACKOFF_MS * (i + 1)));
          }
        }
      } catch {
        handled.current = false;
        finalizing.current = null;
        setError(
          `We couldn't hand in your ${label}. Your answers are saved — check your connection and press Submit ${label} again.`,
        );
      } finally {
        setSaving(false);
      }
    },
    [mockId, section, post, label],
  );

  const activate = useCallback(() => {
    if (activated.current) return;
    activated.current = true;
    if (section === "listening") post({ type: "ACTIVATE" });
  }, [post, section]);

  /**
   * Is OUR adapted paper the document currently in the frame?
   *
   * The frame is same-origin, so this inspects the real document rather than
   * guessing. A `fetch` probe cannot answer this: it is a different request
   * that may land on a different instance, so a 200 there says nothing about
   * what is already on screen. `__IELTS_MOCK_HARVEST__` is installed near the
   * top of the adapter, so by `load` it is there iff our paper booted.
   */
  const adapterPresent = useCallback(() => {
    try {
      const w = iframeRef.current?.contentWindow as (Window & { __IELTS_MOCK_HARVEST__?: unknown }) | null;
      return typeof w?.__IELTS_MOCK_HARVEST__ === "function";
    } catch {
      return false;
    }
  }, []);

  /** Put the paper back the way the student left it, then let it run. */
  const restoreAndActivate = useCallback(() => {
    // The LATEST answers, not the `draft` prop — after a reload mid-section the
    // prop is stale and restoring it would throw away everything since.
    const answers = liveAnswers.current;
    if (Object.keys(answers).length) post({ type: "RESTORE", answers });
    else activate();
  }, [activate, post]);

  /**
   * The document in the frame is not a working paper (the host served an error
   * page, or the adapter failed to boot). Reload it.
   *
   * A working paper is NEVER reloaded. After MAX_PAPER_RETRIES we stop and fall
   * back to the old behaviour — drive whatever is there — rather than stranding
   * the student, and offer them a manual retry.
   */
  const retryPaper = useCallback(() => {
    if (handled.current || done) return;
    if (outageAt.current == null) outageAt.current = Date.now();
    if (paperRetries.current >= MAX_PAPER_RETRIES) {
      setPaperFailed(true);
      if (adapterPresent()) {
        readySeen.current = true;
        setLoading(false);
        restoreAndActivate();
        window.setTimeout(() => {
          restoreDone.current = true;
        }, 8000);
      }
      return;
    }
    paperRetries.current += 1;
    setRetrying(true);
    readySeen.current = false;
    activated.current = false;
    setLoading(true);
    window.setTimeout(
      () => setFrameKey((k) => k + 1),
      PAPER_BACKOFF_MS * paperRetries.current,
    );
  }, [adapterPresent, done, restoreAndActivate]);

  /** A working paper arrived. Close off any outage we were in the middle of. */
  const paperIsUp = useCallback(() => {
    setPaperFailed(false);
    setRetrying(false);
    paperRetries.current = 0;
    if (outageAt.current != null) {
      const ms = Date.now() - outageAt.current;
      outageAt.current = null;
      if (ms > 1500) report({ type: "paper_unavailable", ms });
    }
  }, [report]);

  // Messages from the adapter inside the paper.
  useEffect(() => {
    const origin = window.location.origin;
    function onMessage(e: MessageEvent) {
      if (e.origin !== origin || e.source !== iframeRef.current?.contentWindow) return;
      const d = e.data as { source?: string; type?: string; payload?: Record<string, unknown> } | null;
      if (!d || d.source !== "IELTS_CDI_TEST") return;
      const payload = d.payload ?? {};
      if (d.type === "READY") {
        if (readySeen.current) return;
        readySeen.current = true;
        paperIsUp();
        setLoading(false);
        // NOTE: `payload.started` is deliberately NOT used to trigger a reload.
        // The adapter gives up waiting after ~6 s and sends READY with
        // started:false even for papers that are in fact fine, so reloading on
        // it would burn exam time on a working paper. A 503 produces no READY
        // at all, which is what the timeout and the onLoad check catch.
        restoreAndActivate();
      } else if (d.type === "ADAPTER_ERROR") {
        // The adapter itself failed inside a document that did load.
        if (!readySeen.current) retryPaper();
      } else if (d.type === "RESTORED") {
        restoreDone.current = true;
        const missing = Array.isArray(payload.missing) ? (payload.missing as number[]) : [];
        setNotice(
          missing.length
            ? `Your saved answers are back. Please re-place question${missing.length === 1 ? "" : "s"} ${missing.join(", ")} (drag-and-drop answers cannot be restored automatically).`
            : "Your saved answers have been restored.",
        );
        activate();
      } else if (d.type === "SUBMIT") {
        void submit(parseAnswers(payload.answers), false);
      } else if (d.type === "SNAPSHOT") {
        const answers = parseAnswers(payload.answers);
        if (Object.keys(answers).length) liveAnswers.current = answers;
        if (finalizing.current) void submit(answers, finalizing.current === "auto");
        else if (!handled.current && restoreDone.current) void saveMockSectionDraft(mockId, section, answers, section === "listening" ? maxPos.current : null);
      } else if (d.type === "REQUEST_SUBMIT") {
        // The paper's own Submit: confirm in the page, never with a browser dialog (which drops fullscreen).
        if (handled.current) return;
        const msg = typeof payload.message === "string" ? payload.message : "";
        const line = msg.split("\n").find((l) => /unanswered/i.test(l)) ?? null;
        setConfirmNote(line ? line.trim() : null);
        setConfirming(true);
      } else if (d.type === "NOTICE") {
        const msg = typeof payload.message === "string" ? payload.message.trim() : "";
        if (msg && !/pdf|clipboard|retake|restart/i.test(msg)) setNotice(msg.split("\n")[0]);
      } else if (d.type === "AUDIO_BLOCKED") {
        setNotice("Your browser blocked the recording from starting by itself. Click “Start the recording” in the test.");
      } else if (d.type === "AUDIO_STARTED") {
        setNotice((n) => (n && /blocked the recording/.test(n) ? null : n));
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [activate, mockId, paperIsUp, post, restoreAndActivate, retryPaper, section, submit]);

  /**
   * Nothing from the paper in time. Two very different causes:
   *
   *  - our adapter IS in the frame but stayed quiet — drive it anyway, exactly
   *    as before, so a merely undertalkative paper is never made unusable;
   *  - our adapter is NOT there, so the frame holds something else (the host's
   *    503 page). Reload it.
   */
  useEffect(() => {
    const t = setTimeout(() => {
      if (readySeen.current) return;
      if (!adapterPresent()) {
        retryPaper();
        return;
      }
      readySeen.current = true;
      setLoading(false);
      restoreAndActivate();
      // No RESTORED either: stop holding autosave back after a further grace.
      setTimeout(() => {
        restoreDone.current = true;
      }, 8000);
    }, READY_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [adapterPresent, restoreAndActivate, retryPaper, frameKey]);

  // Autosave.
  useEffect(() => {
    const t = setInterval(() => {
      if (!handled.current) post({ type: "SNAPSHOT" });
    }, SNAPSHOT_MS);
    return () => clearInterval(t);
  }, [post]);

  // Hand in: take a fresh snapshot, fall back to the server's last draft after 4 s.
  const handIn = useCallback(
    (kind: "auto" | "manual") => {
      if (handled.current || finalizing.current) return;
      finalizing.current = kind;
      post({ type: "SNAPSHOT", reason: "final" });
      setTimeout(() => {
        if (!handled.current) void submit({}, kind === "auto");
      }, 4000);
    },
    [post, submit],
  );

  // Official clock; auto hand-in at zero.
  useEffect(() => {
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= deadline) handIn("auto");
    }, 1000);
    return () => clearInterval(t);
  }, [deadline, handIn]);

  // The last-moment save the section flow runs on pagehide / Leave.
  useEffect(() => {
    flushRef.current = () => {
      if (handled.current || !restoreDone.current) return;
      let answers: Answers | null = null;
      try {
        const w = iframeRef.current?.contentWindow as (Window & { __IELTS_MOCK_HARVEST__?: () => unknown }) | null;
        answers = parseAnswers(w?.__IELTS_MOCK_HARVEST__?.());
      } catch {
        answers = null;
      }
      if (!answers) return;
      beaconDraft({ mockId, section, answers, audioPos: section === "listening" ? maxPos.current : null });
    };
    return () => {
      flushRef.current = null;
    };
  }, [flushRef, mockId, section]);

  // Leaving mid-section is a real loss (the recording does not replay): ask first.
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (handled.current) return;
      post({ type: "SNAPSHOT" });
      e.preventDefault();
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [post]);

  // Guard the recording once the paper has loaded.
  const onLoad = useCallback(() => {
    // The frame finished loading SOMETHING. If it is not our paper, it is an
    // error page from the host — catch it now rather than after the 15 s
    // readiness timeout, so recovery takes seconds instead of a lost section.
    if (!adapterPresent()) {
      retryPaper();
      return;
    }
    if (section !== "listening") return;
    let tries = 0;
    let lastSeekReport = 0;
    const find = setInterval(() => {
      tries++;
      let audio: HTMLAudioElement | null = null;
      try {
        audio = iframeRef.current?.contentDocument?.querySelector("audio") ?? null;
      } catch {
        audio = null;
      }
      if (!audio && tries < 60) return;
      clearInterval(find);
      if (!audio) return;
      mediaRef.current = audio;
      const a = audio;
      // Resume where the student had got to, not from the start.
      const jump = () => {
        if (maxPos.current > 1 && a.currentTime < maxPos.current - 1) a.currentTime = maxPos.current;
      };
      a.addEventListener("play", jump);
      a.addEventListener("loadedmetadata", jump);
      a.addEventListener("timeupdate", () => {
        if (!a.seeking && a.currentTime > maxPos.current) maxPos.current = a.currentTime;
      });
      // The recording plays once: a rewind is snapped back to the furthest point.
      a.addEventListener("seeking", () => {
        if (a.currentTime < maxPos.current - 1.5) {
          a.currentTime = maxPos.current;
          const t = Date.now();
          if (t - lastSeekReport > 5000) {
            lastSeekReport = t;
            report({ type: "seek_back" });
          }
        }
      });
    }, 1000);
  }, [adapterPresent, mediaRef, report, retryPaper, section]);

  const remaining = Math.max(0, deadline - now);

  return (
    <div className="flex h-full flex-col">
      <ExamTopBar
        label={label}
        title={title}
        center={<ExamClock remainingMs={remaining} />}
        right={
          <Button
            size="sm"
            className="h-9"
            onClick={() => {
              setConfirmNote(null);
              setConfirming(true);
            }}
            disabled={saving || done}
          >
            <Send className="h-4 w-4" /> Submit {label}
          </Button>
        }
      />

      {notice && !done && (
        <div className="flex items-center justify-between gap-3 border-b border-primary/20 bg-primary/5 px-3 py-2 text-sm">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} className="text-xs text-muted underline">
            Dismiss
          </button>
        </div>
      )}

      <div className="relative min-h-0 flex-1">
        {/* `key` remounts the frame, which is the reliable way to force a fresh
            document (and a fresh contentWindow, so stale postMessages from the
            replaced one fail the `e.source` check). */}
        <iframe
          key={frameKey}
          ref={iframeRef}
          src={`/api/test-html/${testId}?mock=${attemptId}${frameKey ? `&g=${frameKey}` : ""}`}
          title={title}
          onLoad={onLoad}
          allow="autoplay"
          className="h-full w-full bg-white"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
        />
        {/* OPAQUE: a translucent overlay let the host's raw 503 page show through. */}
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background text-sm text-muted">
            <span className="inline-flex items-center">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {retrying ? `Reconnecting to the ${label} paper…` : `Opening the ${label} paper…`}
            </span>
            {retrying && (
              <span className="text-xs">Your answers are safe. Your clock is still running.</span>
            )}
          </div>
        )}
        {paperFailed && (
          <div className="absolute inset-0 flex items-center justify-center bg-background p-6">
            <div className="max-w-md space-y-3 rounded-2xl border border-danger/40 bg-danger/5 p-5 text-center text-sm">
              <p className="font-medium">The {label} paper didn&apos;t load.</p>
              <p className="text-muted">
                This is a problem on our side, not yours, and it has been recorded for your teacher. Your answers are
                saved — but your clock is still running, so try again now.
              </p>
              <Button
                onClick={() => {
                  paperRetries.current = 0;
                  setPaperFailed(false);
                  setRetrying(true);
                  readySeen.current = false;
                  activated.current = false;
                  setLoading(true);
                  setFrameKey((k) => k + 1);
                }}
              >
                Reload the paper
              </Button>
            </div>
          </div>
        )}
      </div>

      {saving && (
        <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm shadow-lg">
          <Loader2 className="h-4 w-4 animate-spin" /> Saving your answers…
        </div>
      )}

      {error && (
        <div className="absolute bottom-4 left-1/2 w-[min(28rem,calc(100%-2rem))] -translate-x-1/2 rounded-lg border border-danger/30 bg-surface px-4 py-2 text-sm text-danger shadow-lg">
          {error} Use “Submit {label}” at the top again once you are back online.
        </div>
      )}

      {confirming && !done && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-xl">
            <h2 className="font-semibold">Submit {label}?</h2>
            {confirmNote && <p className="mt-2 rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">{confirmNote}</p>}
            <p className="mt-2 text-sm text-muted">
              You cannot come back to this section afterwards. Unanswered questions score zero.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setConfirming(false);
                  setConfirmNote(null);
                }}
              >
                Keep working
              </Button>
              <Button
                onClick={() => {
                  setConfirming(false);
                  handIn("manual");
                }}
              >
                Submit
              </Button>
            </div>
          </div>
        </div>
      )}

      {done && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 text-center shadow-xl">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/10 text-success">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <h2 className="mt-4 text-lg font-bold">{label} submitted</h2>
            <p className="mt-1 text-sm text-muted">
              {notice && /Time is up/.test(notice) ? `${notice} ` : ""}
              Your answers are saved. Scores are not shown during the mock — your teacher releases the full result once
              everything is marked.
            </p>
            <Button className="mt-6 w-full" onClick={onNext}>
              {nextLabel} <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
