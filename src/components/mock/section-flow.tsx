"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, LogOut, Loader2, Play } from "lucide-react";
import { beginMockSection, finishMockVideo, saveMockVideoProgress } from "@/app/actions/mock";
import { Button } from "@/components/ui/button";
import { ExamGuard, leaveExamFullscreen } from "@/components/mock/exam-guard";
import { ExamClock, ExamTopBar, minutesLabel } from "@/components/mock/exam-top-bar";
import { PaperSection } from "@/components/mock/mock-runner";
import { WritingSection, type WritingProps } from "@/components/mock/writing-exam";
import type { MockSection } from "@/lib/mock-shared";

// One mock section, end to end (0054):
//
//   fullscreen → instruction video (no skip, no seek) → "Start <section>" → paper
//
// The section clock starts on the Start click (beginMockSection), never on page
// open, and the client swaps straight to the paper — a navigation would be a
// page render, which the server records as a reload.

const LABEL: Record<MockSection, string> = { listening: "Listening", reading: "Reading", writing: "Writing" };

const NOTES: Record<MockSection, string[]> = {
  listening: [
    "The recording starts as soon as you click Start and plays once. You cannot pause or rewind it.",
    "Answer as you listen. The timer at the top is the only clock that counts.",
    "Leaving fullscreen pauses the recording and is recorded for your teacher.",
  ],
  reading: [
    "The timer starts when you click Start and keeps running if you leave or reload.",
    "Answers save automatically. Submit from the button at the top when you finish.",
    "When time is up your answers are handed in automatically.",
  ],
  writing: [
    "Task 1 and Task 2 share one clock that starts when you click Start. Switch between them with Part 1 / Part 2 at the bottom.",
    "Task 1: spend about 20 minutes and write at least 150 words. Task 2: spend about 40 minutes and write at least 250 words.",
    "Violations: leaving the exam for another tab or app for 5 seconds or more, pasting more than 10 words, and reloading the page.",
    "After 3 violations your writing is submitted automatically, exactly as it is.",
    "Pressing Esc hides the test until you return to fullscreen — the clock keeps running.",
    "Your essays save every 20 seconds. When time is up your writing is handed in automatically.",
  ],
};

type PaperPayload = { deadline: number; draft: Record<string, string>; audioPos: number; testId: string; title: string };
type WritingPayload = Omit<WritingProps, "mockId" | "studentName">;

export type SectionFlowProps = {
  mockId: string;
  attemptId: string;
  section: MockSection;
  mockTitle: string;
  /** For the Writing PDF copy. */
  studentName: string;
  phase: "video" | "ready" | "active";
  minutes: number;
  video: { url: string; duration: number } | null;
  videoPos: number;
  /** Why the session won't let this student start (waiting / ended); null = may start. */
  blocked: string | null;
  reloaded: boolean;
  initialLongAway: number;
  nextHref: string;
  nextLabel: string;
  paper?: PaperPayload;
  writing?: WritingPayload;
};

export function SectionFlow(props: SectionFlowProps) {
  const { mockId, attemptId, section, phase: initialPhase, video, blocked } = props;
  const [phase, setPhase] = useState(initialPhase);
  const [paper, setPaper] = useState<PaperPayload | undefined>(props.paper);
  const [writing, setWriting] = useState<WritingPayload | undefined>(props.writing);
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const wasPlaying = useRef(false);
  const flushRef = useRef<(() => void) | null>(null);
  const router = useRouter();
  const [leaveAsked, setLeaveAsked] = useState(false);

  // Last-moment save whenever the page goes away (reload, close, Leave).
  useEffect(() => {
    const onHide = () => flushRef.current?.();
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, []);

  // The browser Back button does not fire beforeunload in a client-side app, so
  // it would silently drop the student out of the exam. A guard history entry
  // turns Back into our "Leave the exam?" box.
  useEffect(() => {
    window.history.pushState({ mockExamGuard: true }, "");
    const onPop = () => {
      window.history.pushState({ mockExamGuard: true }, "");
      setLeaveAsked(true);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const leave = useCallback(async () => {
    flushRef.current?.();
    await leaveExamFullscreen();
    // A full navigation: nothing of the exam page (clocks, iframe, listeners) survives.
    window.location.assign(`/mock/${mockId}`);
  }, [mockId]);

  // Next section: a client navigation, so fullscreen (on the document) carries over.
  const goNext = useCallback(() => {
    router.push(props.nextHref);
  }, [props.nextHref, router]);

  const onAway = useCallback(() => {
    const m = mediaRef.current;
    wasPlaying.current = !!m && !m.paused && !m.ended;
    if (wasPlaying.current) m!.pause();
  }, []);
  const onReturn = useCallback(() => {
    if (wasPlaying.current) void mediaRef.current?.play().catch(() => {});
    wasPlaying.current = false;
  }, []);

  const label = LABEL[section];
  const readyText =
    phase === "active"
      ? undefined
      : phase === "video"
        ? {
            title: `${label} — instructions`,
            body: props.videoPos > 1
              ? "Enter fullscreen to continue the instruction video from where you stopped. Your section clock has not started."
              : "Watch the short instruction video in fullscreen. The section clock starts only when you click Start after it.",
            button: props.videoPos > 1 ? "Enter fullscreen & continue" : "Enter fullscreen & watch",
          }
        : {
            title: `Start ${label}`,
            body: "You have watched the instructions. Enter fullscreen, then start the section when you are ready.",
            button: "Enter fullscreen",
          };

  return (
    <div className="fixed inset-0 z-50 bg-background">
      <ExamGuard
        mockId={mockId}
        attemptId={attemptId}
        section={section}
        sectionLabel={label}
        reloaded={props.reloaded}
        initialLongAway={props.initialLongAway}
        onAway={onAway}
        onReturn={onReturn}
        readyText={readyText}
        className="h-full"
      >
        {phase === "video" && video && (
          <InstructionVideo
            mockId={mockId}
            section={section}
            video={video}
            startPos={props.videoPos}
            minutes={props.minutes}
            blocked={blocked}
            mediaRef={mediaRef}
            onDone={() => {
              mediaRef.current = null;
              setPhase("ready");
            }}
          />
        )}
        {(phase === "ready" || (phase === "video" && !video)) && (
          <StartPanel
            mockId={mockId}
            section={section}
            mockTitle={props.mockTitle}
            minutes={props.minutes}
            blocked={blocked}
            onStarted={(p) => {
              if (p.kind === "paper") setPaper(p.payload);
              else setWriting(p.payload);
              setPhase("active");
            }}
          />
        )}
        {phase === "active" && section !== "writing" && paper && (
          <PaperSection
            mockId={mockId}
            attemptId={attemptId}
            section={section}
            testId={paper.testId}
            title={paper.title}
            nextLabel={props.nextLabel}
            deadline={paper.deadline}
            draft={paper.draft}
            audioPos={paper.audioPos}
            mediaRef={mediaRef}
            flushRef={flushRef}
            onNext={goNext}
          />
        )}
        {phase === "active" && section === "writing" && writing && (
          <WritingSection mockId={mockId} studentName={props.studentName} {...writing} flushRef={flushRef} />
        )}
      </ExamGuard>

      {leaveAsked && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4" role="alertdialog" aria-modal="true" aria-label="Leave the exam?">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-xl">
            <h2 className="flex items-center gap-2 font-semibold">
              <LogOut className="h-5 w-5 text-warning" /> Leave the exam?
            </h2>
            <p className="mt-2 text-sm text-muted">
              {phase === "active"
                ? "The clock keeps running while you are away, and your answers are saved. If time runs out, this section is handed in automatically."
                : "Your section clock has not started yet. You can come back and continue from here."}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => void leave()}>
                Leave
              </Button>
              <Button onClick={() => setLeaveAsked(false)} autoFocus>
                Stay in the exam
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ the video

const PROGRESS_MS = 5_000;

function InstructionVideo({
  mockId,
  section,
  video,
  startPos,
  minutes,
  blocked,
  mediaRef,
  onDone,
}: {
  mockId: string;
  section: MockSection;
  video: { url: string; duration: number };
  startPos: number;
  minutes: number;
  blocked: string | null;
  mediaRef: React.MutableRefObject<HTMLMediaElement | null>;
  onDone: () => void;
}) {
  const router = useRouter();
  const ref = useRef<HTMLVideoElement>(null);
  const resumeAt = Math.max(0, Math.min(startPos, video.duration));
  const watched = useRef(resumeAt);
  const lastSaved = useRef(-1);
  const finished = useRef(false);
  const [current, setCurrent] = useState(resumeAt);
  const [needsClick, setNeedsClick] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [failed, setFailed] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const label = LABEL[section];

  // The session isn't admitting this student: re-check every 20 s, open when it does.
  useEffect(() => {
    if (!blocked) return;
    const t = setInterval(() => router.refresh(), 20_000);
    return () => clearInterval(t);
  }, [blocked, router]);

  const save = useCallback(
    (force = false) => {
      const pos = Math.round(watched.current * 10) / 10;
      if (!force && pos === lastSaved.current) return;
      lastSaved.current = pos;
      void saveMockVideoProgress(mockId, section, pos).catch(() => {});
    },
    [mockId, section],
  );

  const tryPlay = useCallback(() => {
    const v = ref.current;
    if (!v) return;
    v.play()
      .then(() => {
        setNeedsClick(false);
        save(true); // the server starts its own stopwatch on the first save
      })
      .catch(() => setNeedsClick(true));
  }, [save]);

  const finish = useCallback(async () => {
    if (finished.current) return;
    finished.current = true;
    setChecking(true);
    save(true);
    // The server insists it saw the time pass; a slow save can lag a second or two.
    for (let i = 0; i < 12; i++) {
      const res = await finishMockVideo(mockId, section).catch(() => ({ ok: false as const, error: "offline" }));
      if (res.ok) {
        setChecking(false);
        onDone();
        return;
      }
      await new Promise((r) => setTimeout(r, 2500));
    }
    setChecking(false);
    finished.current = false;
    setFailed("We couldn't confirm the video finished. Check your connection, then reload the page — it continues where you stopped.");
  }, [mockId, onDone, save, section]);

  useEffect(() => {
    if (blocked) return;
    const v = ref.current;
    if (!v) return;
    mediaRef.current = v;
    const onMeta = () => {
      if (watched.current > 0.5 && watched.current < v.duration - 0.5) v.currentTime = watched.current;
      tryPlay();
    };
    const onTime = () => {
      if (!v.seeking && v.currentTime > watched.current && v.currentTime - watched.current < 2) watched.current = v.currentTime;
      setCurrent(v.currentTime);
    };
    // No skipping ahead: any jump past what has been watched snaps back.
    const onSeeking = () => {
      if (v.currentTime > watched.current + 1) v.currentTime = watched.current;
    };
    const onRate = () => {
      if (v.playbackRate !== 1) v.playbackRate = 1;
    };
    const onWaiting = () => setBuffering(true);
    const onPlaying = () => setBuffering(false);
    const onError = () => setFailed("The instruction video couldn't load. Check your connection, then reload the page.");
    const onEnded = () => {
      watched.current = video.duration;
      void finish();
    };
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("seeking", onSeeking);
    v.addEventListener("ratechange", onRate);
    v.addEventListener("waiting", onWaiting);
    v.addEventListener("playing", onPlaying);
    v.addEventListener("error", onError);
    v.addEventListener("ended", onEnded);
    if (v.readyState >= 1) onMeta();
    const t = setInterval(() => save(), PROGRESS_MS);
    return () => {
      clearInterval(t);
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("seeking", onSeeking);
      v.removeEventListener("ratechange", onRate);
      v.removeEventListener("waiting", onWaiting);
      v.removeEventListener("playing", onPlaying);
      v.removeEventListener("error", onError);
      v.removeEventListener("ended", onEnded);
      save();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- wired once per mount
  }, [blocked]);

  // Reloading during the video asks first (the browser's own wording), then resumes.
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (finished.current) return;
      save(true);
      e.preventDefault();
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [save]);

  const left = Math.max(0, video.duration - current);
  const pct = Math.min(100, (current / video.duration) * 100);

  return (
    <div className="flex h-full flex-col bg-black">
      <ExamTopBar
        label={label}
        title="Instructions"
        center={<ExamClock remainingMs={null} idle={`${minutesLabel(minutes)} · starts after the video`} />}
        right={<span className="text-xs text-muted">{Math.ceil(left)} s left</span>}
      />
      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        {blocked ? (
          <div className="max-w-md rounded-2xl bg-surface p-6 text-center">
            <AlertTriangle className="mx-auto h-8 w-8 text-warning" />
            <p className="mt-3 text-sm">{blocked}</p>
          </div>
        ) : (
          <>
            <video
              ref={ref}
              src={video.url}
              preload="auto"
              playsInline
              disablePictureInPicture
              controls={false}
              controlsList="nodownload noplaybackrate noremoteplayback"
              onContextMenu={(e) => e.preventDefault()}
              className="max-h-full max-w-full"
            />
            {(needsClick || failed || checking || (buffering && !needsClick)) && (
              <div className="absolute inset-0 flex items-center justify-center">
                {failed ? (
                  <div className="max-w-md rounded-2xl bg-surface p-6 text-center text-sm text-danger">{failed}</div>
                ) : needsClick ? (
                  <Button className="h-14 px-8 text-lg" onClick={tryPlay}>
                    <Play className="h-5 w-5" /> Play the instructions
                  </Button>
                ) : (
                  <span className="inline-flex items-center gap-2 rounded-lg bg-black/60 px-4 py-2 text-sm text-white">
                    <Loader2 className="h-4 w-4 animate-spin" /> {checking ? "One moment…" : "Loading…"}
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </div>
      {!blocked && (
        <div className="h-1.5 w-full bg-white/10" aria-hidden>
          <div className="h-full bg-primary transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ start

type Started = { kind: "paper"; payload: PaperPayload } | { kind: "writing"; payload: WritingPayload };

function StartPanel({
  mockId,
  section,
  mockTitle,
  minutes,
  blocked,
  onStarted,
}: {
  mockId: string;
  section: MockSection;
  mockTitle: string;
  minutes: number;
  blocked: string | null;
  onStarted: (s: Started) => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Writing v3: the student confirms the 3-violation rule before the clock starts.
  const [agreed, setAgreed] = useState(section !== "writing");
  const label = LABEL[section];

  useEffect(() => {
    if (!blocked) return;
    const t = setInterval(() => router.refresh(), 20_000);
    return () => clearInterval(t);
  }, [blocked, router]);

  async function start() {
    setPending(true);
    setError(null);
    try {
      const res = await beginMockSection(mockId, section);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const deadline = new Date(res.startedAt).getTime() + res.minutes * 60_000;
      if ("testId" in res) {
        onStarted({ kind: "paper", payload: { deadline, draft: res.draft, audioPos: res.audioPos, testId: res.testId, title: res.title } });
      } else {
        onStarted({
          kind: "writing",
          payload: {
            title: mockTitle,
            deadline,
            initialTask1: res.task1,
            initialTask2: res.task2,
            task1Prompt: res.task1Prompt,
            task2Prompt: res.task2Prompt,
            task1ImageUrl: res.task1ImageUrl,
            initialViolations: res.violations,
          },
        });
      }
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <ExamTopBar label={label} center={<ExamClock remainingMs={null} idle={minutesLabel(minutes)} />} />
      <div className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-lg rounded-2xl border border-border bg-surface p-7 shadow-soft">
          <p className="text-xs font-medium uppercase tracking-wide text-primary">Ready</p>
          <h1 className="mt-1 text-2xl font-bold">{label}</h1>
          <p className="mt-1 text-sm text-muted">{minutes} minutes</p>
          <ul className="mt-4 list-disc space-y-1.5 pl-5 text-sm">
            {NOTES[section].map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
          {blocked ? (
            <p className="mt-6 rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-sm">{blocked}</p>
          ) : (
            <>
            {section === "writing" && (
              <label className="mt-5 flex cursor-pointer items-start gap-2.5 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2.5 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                />
                <span>I understand that 3 violations will submit my writing automatically.</span>
              </label>
            )}
            <Button className="mt-6 h-12 w-full text-base" onClick={start} disabled={pending || !agreed}>
              {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5" />} Start {label}
            </Button>
            </>
          )}
          {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        </div>
      </div>
    </div>
  );
}
