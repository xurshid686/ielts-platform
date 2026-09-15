"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
/** How long to wait for the paper's READY before driving it anyway. */
const READY_TIMEOUT_MS = 15_000;

export type PaperSectionProps = {
  mockId: string;
  attemptId: string;
  section: "listening" | "reading";
  testId: string;
  title: string;
  nextHref: string;
  nextLabel: string;
  /** Server deadline, epoch ms. */
  deadline: number;
  draft: Answers;
  audioPos: number;
  /** The section flow's handle on whatever is playing, so leaving fullscreen can pause it. */
  mediaRef: React.MutableRefObject<HTMLMediaElement | null>;
};

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
  nextHref,
  nextLabel,
  deadline,
  draft,
  audioPos,
  mediaRef,
}: PaperSectionProps) {
  const router = useRouter();
  const report = useExamReport();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const handled = useRef(false);
  const maxPos = useRef(audioPos);
  const finalizing = useRef<"auto" | "manual" | null>(null);
  const readySeen = useRef(false);
  const activated = useRef(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [confirming, setConfirming] = useState(false);
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

  const submit = useCallback(
    async (answers: Answers, auto: boolean) => {
      if (handled.current) return;
      handled.current = true;
      setSaving(true);
      setError(null);
      const res = await submitMockSection(mockId, section, answers);
      setSaving(false);
      if (!res.ok) {
        if (/already been submitted/i.test(res.error)) {
          post({ type: "LOCK" });
          setDone(true);
          return;
        }
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
    },
    [mockId, section, post],
  );

  const activate = useCallback(() => {
    if (activated.current) return;
    activated.current = true;
    if (section === "listening") post({ type: "ACTIVATE" });
  }, [post, section]);

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
        setLoading(false);
        if (Object.keys(draft).length) post({ type: "RESTORE", answers: draft });
        else activate();
      } else if (d.type === "RESTORED") {
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
        if (finalizing.current) void submit(answers, finalizing.current === "auto");
        else if (!handled.current) void saveMockSectionDraft(mockId, section, answers, section === "listening" ? maxPos.current : null);
      } else if (d.type === "AUDIO_BLOCKED") {
        setNotice("Your browser blocked the recording from starting by itself. Click “Start the recording” in the test.");
      } else if (d.type === "AUDIO_STARTED") {
        setNotice((n) => (n && /blocked the recording/.test(n) ? null : n));
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [activate, draft, mockId, post, section, submit]);

  // A paper that never says READY is still driven, so a student is never stuck.
  useEffect(() => {
    const t = setTimeout(() => {
      if (readySeen.current) return;
      readySeen.current = true;
      setLoading(false);
      if (Object.keys(draft).length) post({ type: "RESTORE", answers: draft });
      activate();
    }, READY_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [activate, draft, post]);

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
  }, [mediaRef, report, section]);

  const remaining = Math.max(0, deadline - now);

  return (
    <div className="flex h-full flex-col">
      <ExamTopBar
        label={label}
        title={title}
        center={<ExamClock remainingMs={remaining} />}
        right={
          <Button size="sm" className="h-9" onClick={() => setConfirming(true)} disabled={saving || done}>
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
        <iframe
          ref={iframeRef}
          src={`/api/test-html/${testId}?mock=${attemptId}`}
          title={title}
          onLoad={onLoad}
          allow="autoplay"
          className="h-full w-full bg-white"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
        />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 text-sm text-muted">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Opening the {label} paper…
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
            <p className="mt-1 text-sm text-muted">
              You cannot come back to this section afterwards. Unanswered questions score zero.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirming(false)}>
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
            <Button className="mt-6 w-full" onClick={() => router.push(nextHref)}>
              {nextLabel} <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
