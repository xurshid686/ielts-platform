"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, Clock, Loader2 } from "lucide-react";
import { saveMockSectionDraft, submitMockSection } from "@/app/actions/mock";
import { Button } from "@/components/ui/button";
import { ExamGuard, useExamReport } from "@/components/mock/exam-guard";
import { cn } from "@/lib/utils";

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

type Props = {
  mockId: string;
  attemptId: string;
  section: "listening" | "reading";
  testId: string;
  title: string;
  nextHref: string;
  nextLabel: string;
  /** Server deadline, epoch ms. The CDI file's own timer restarts on reload; this one does not. */
  deadline: number;
  draft: Answers;
  audioPos: number;
  reloaded: boolean;
  initialLongAway: number;
};

/**
 * The CDI player for ONE section of a mock exam, inside the ExamGuard shell.
 *
 * Separate from TestRunner on purpose: TestRunner's job after submit is to SHOW
 * things (band, rating, streak, review), every one of which is wrong here.
 *
 * On top of the guard (fullscreen, overlay, reporting) this owns the parts that
 * need the iframe (0052):
 *  - autosave: asks the bridge for a SNAPSHOT every 15 s → saveMockSectionDraft
 *  - restore:  after a reload, sends the draft back to the bridge (RESTORE)
 *  - audio:    pauses Listening while the student is away (owner's decision),
 *              resumes from the furthest point reached, snaps rewinds forward
 *  - the official clock from the server deadline, auto-handing-in at zero
 */
export function MockRunner(props: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const wasPlaying = useRef(false);

  const onAway = useCallback(() => {
    const a = audioRef.current;
    wasPlaying.current = !!a && !a.paused && !a.ended;
    if (wasPlaying.current) a!.pause();
  }, []);
  const onReturn = useCallback(() => {
    if (wasPlaying.current) void audioRef.current?.play().catch(() => {});
    wasPlaying.current = false;
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-background">
      <ExamGuard
        mockId={props.mockId}
        attemptId={props.attemptId}
        section={props.section}
        sectionLabel={props.section === "listening" ? "Listening" : "Reading"}
        reloaded={props.reloaded}
        initialLongAway={props.initialLongAway}
        onAway={props.section === "listening" ? onAway : undefined}
        onReturn={props.section === "listening" ? onReturn : undefined}
        className="h-full"
      >
        <RunnerBody {...props} audioRef={audioRef} />
      </ExamGuard>
    </div>
  );
}

function RunnerBody({
  mockId,
  section,
  testId,
  title,
  nextHref,
  nextLabel,
  deadline,
  draft,
  audioPos,
  audioRef,
}: Props & { audioRef: React.MutableRefObject<HTMLAudioElement | null> }) {
  const router = useRouter();
  const report = useExamReport();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const handled = useRef(false);
  const maxPos = useRef(audioPos);
  const finalizing = useRef(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const post = useCallback((msg: Record<string, unknown>) => {
    try {
      iframeRef.current?.contentWindow?.postMessage({ source: "IELTS_PLATFORM", ...msg }, window.location.origin);
    } catch {
      /* iframe gone */
    }
  }, []);

  const submit = useCallback(
    async (answers: Answers, auto: boolean) => {
      if (handled.current) return;
      handled.current = true;
      setSaving(true);
      setError(null);
      const res = await submitMockSection(mockId, section, answers);
      setSaving(false);
      if (!res.ok) {
        // "Already submitted" means a previous submit landed; treat it as done.
        if (/already been submitted/i.test(res.error)) {
          setDone(true);
          return;
        }
        handled.current = false;
        finalizing.current = false;
        setError(res.error);
        return;
      }
      // No router.refresh(): the section page redirects away from a submitted
      // section, which would unmount this screen before it is read.
      if (auto) setNotice("Time is up — your answers were handed in.");
      setDone(true);
    },
    [mockId, section],
  );

  // Messages from the bridge inside the CDI file.
  useEffect(() => {
    const origin = window.location.origin;
    function onMessage(e: MessageEvent) {
      if (e.origin !== origin || e.source !== iframeRef.current?.contentWindow) return;
      const d = e.data as { source?: string; type?: string; payload?: Record<string, unknown> } | null;
      if (!d || d.source !== "IELTS_CDI_TEST") return;
      const payload = d.payload ?? {};
      if (d.type === "SUBMIT") {
        void submit(parseAnswers(payload.answers), false);
      } else if (d.type === "SNAPSHOT") {
        const answers = parseAnswers(payload.answers);
        if (finalizing.current) void submit(answers, true);
        else if (!handled.current) void saveMockSectionDraft(mockId, section, answers, section === "listening" ? maxPos.current : null);
      } else if (d.type === "RESTORED") {
        const missing = Array.isArray(payload.missing) ? (payload.missing as number[]) : [];
        if (missing.length) {
          setNotice(`Your saved answers are back. Please re-place question${missing.length === 1 ? "" : "s"} ${missing.join(", ")} (drag-and-drop answers cannot be restored automatically).`);
        } else {
          setNotice("Your saved answers have been restored.");
        }
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [mockId, section, submit]);

  // Autosave.
  useEffect(() => {
    const t = setInterval(() => {
      if (!handled.current) post({ type: "SNAPSHOT" });
    }, SNAPSHOT_MS);
    return () => clearInterval(t);
  }, [post]);

  // Official clock; hand in at zero from the freshest snapshot (server falls back to its draft).
  useEffect(() => {
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= deadline && !handled.current && !finalizing.current) {
        finalizing.current = true;
        post({ type: "SNAPSHOT" });
        setTimeout(() => {
          if (!handled.current) void submit({}, true);
        }, 3000);
      }
    }, 1000);
    return () => clearInterval(t);
  }, [deadline, post, submit]);

  // Wire the iframe once it loads: restore answers, and guard the audio.
  const onLoad = useCallback(() => {
    if (Object.keys(draft).length) setTimeout(() => post({ type: "RESTORE", answers: draft }), 800);
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
      audioRef.current = audio;
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
  }, [audioRef, draft, post, report, section]);

  function goNext() {
    router.push(nextHref);
  }

  const remaining = Math.max(0, deadline - now);
  const mins = Math.floor(remaining / 60_000);
  const secs = Math.floor((remaining % 60_000) / 1000);
  const label = section === "listening" ? "Listening" : "Reading";

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border bg-surface px-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">Mock · {label}</span>
          <span className="truncate text-sm font-medium">{title}</span>
        </div>
        <span
          title="Official time left for this section. It keeps running if you leave or reload."
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-mono text-sm font-semibold tabular-nums",
            remaining < 5 * 60_000 ? "bg-danger/10 text-danger" : "bg-surface-2",
          )}
        >
          <Clock className="h-4 w-4" /> Time left {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
        </span>
      </div>

      {notice && !done && (
        <div className="flex items-center justify-between gap-3 border-b border-primary/20 bg-primary/5 px-3 py-2 text-sm">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} className="text-xs text-muted underline">
            Dismiss
          </button>
        </div>
      )}

      <iframe
        ref={iframeRef}
        src={`/api/test-html/${testId}`}
        title={title}
        onLoad={onLoad}
        className="min-h-0 w-full flex-1 bg-white"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
      />

      {saving && (
        <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm shadow-lg">
          <Loader2 className="h-4 w-4 animate-spin" /> Saving your answers…
        </div>
      )}

      {error && (
        <div className="absolute bottom-4 left-1/2 w-[min(28rem,calc(100%-2rem))] -translate-x-1/2 rounded-lg border border-danger/30 bg-surface px-4 py-2 text-sm text-danger shadow-lg">
          {error} Submit again from the test once you are back online.
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
            <Button className="mt-6 w-full" onClick={goNext}>
              {nextLabel} <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
