"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AlertTriangle, Laptop, Maximize, Copy as TabsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  HIDDEN_GRACE_MS,
  LONG_AWAY_MS,
  isExamCapableDevice,
  type MockSection,
} from "@/lib/mock-shared";
import { cn } from "@/lib/utils";

// The exam shell for every mock section (0052).
//
// What it enforces, and what it deliberately does not — agreed with Codex, Grok
// and agy, and decided by the owner:
//
//  - LAPTOP/DESKTOP ONLY. No fine pointer, a small screen or no element
//    Fullscreen API (iPhone Safari) → a "use a computer" screen, no Start.
//  - FULLSCREEN TO BEGIN. The section is not mounted until the student has
//    entered fullscreen with a click (browsers require a user gesture).
//  - LEAVING COVERS THE TEST, IT DOES NOT STOP THE CLOCK. Esc / leaving
//    fullscreen puts an opaque overlay over the content and makes it inert
//    (no clicks, no typing). The section clock keeps running on the server.
//    The runner may pause Listening audio through onAway/onReturn.
//  - NOTHING AUTOMATIC. Departures, hidden-tab time and second tabs are
//    reported for the teacher's integrity report. No auto-submit, no penalty.
//
// A browser cannot see a phone on the desk or a helper in the room; this is a
// deterrent and a record, not a lock.

type ReportEvent =
  | { type: "away"; ms: number; kind: "fullscreen" | "hidden" }
  | { type: "paste"; words: number; task: 1 | 2 }
  | { type: "seek_back" }
  | { type: "second_tab" }
  | { type: "device"; ua: string; screen: string };

const ReportContext = createContext<(e: ReportEvent) => void>(() => {});

/** Lets exam content (writing paste handler, audio guard) add integrity events. */
export function useExamReport() {
  return useContext(ReportContext);
}

const FLUSH_MS = 15_000;

type Phase = "checking" | "blocked-device" | "second-tab" | "ready" | "active";

export function ExamGuard({
  mockId,
  attemptId,
  section,
  sectionLabel,
  reloaded,
  initialLongAway,
  onAway,
  onReturn,
  className,
  children,
}: {
  mockId: string;
  attemptId: string;
  section: MockSection;
  sectionLabel: string;
  /** The server saw this section opened before: the clock has been running. */
  reloaded: boolean;
  /** Long departures already on record for this attempt (survives reloads). */
  initialLongAway: number;
  onAway?: () => void;
  onReturn?: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("checking");
  const [away, setAway] = useState(false);
  const [longAway, setLongAway] = useState(initialLongAway);
  const awaySince = useRef<number | null>(null);
  const hiddenSince = useRef<number | null>(null);
  const queue = useRef<Record<string, unknown>[]>([]);
  const onAwayRef = useRef(onAway);
  const onReturnRef = useRef(onReturn);
  useEffect(() => {
    onAwayRef.current = onAway;
    onReturnRef.current = onReturn;
  }, [onAway, onReturn]);

  // ---- reporting --------------------------------------------------------
  const flush = useCallback(
    (beacon = false) => {
      if (!queue.current.length) return;
      const body = JSON.stringify({ mockId, events: queue.current.splice(0, 50) });
      try {
        if (beacon && typeof navigator.sendBeacon === "function") {
          navigator.sendBeacon("/api/mock-events", new Blob([body], { type: "application/json" }));
        } else {
          void fetch("/api/mock-events", { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } });
        }
      } catch {
        /* reporting must never break the exam */
      }
    },
    [mockId],
  );

  const report = useCallback(
    (e: ReportEvent) => {
      queue.current.push({ ...e, section });
      if (queue.current.length >= 20) flush();
    },
    [flush, section],
  );

  useEffect(() => {
    const t = setInterval(() => flush(), FLUSH_MS);
    const onHide = () => flush(true);
    window.addEventListener("pagehide", onHide);
    return () => {
      clearInterval(t);
      window.removeEventListener("pagehide", onHide);
      flush(true);
    };
  }, [flush]);

  // ---- device + second tab (after mount: needs window) ------------------
  useEffect(() => {
    const capable = isExamCapableDevice({
      finePointer: window.matchMedia("(pointer: fine)").matches,
      anyFinePointer: window.matchMedia("(any-pointer: fine)").matches,
      screenW: window.screen.width,
      screenH: window.screen.height,
      fullscreenEnabled: !!document.fullscreenEnabled,
    });

    let channel: BroadcastChannel | null = null;
    const me = Math.random().toString(36).slice(2);
    let decided = false;
    const decide = (p: Phase) => {
      if (decided) return;
      decided = true;
      setPhase(p);
    };

    if (!capable) {
      decide("blocked-device");
      return;
    }
    if (typeof BroadcastChannel === "function") {
      channel = new BroadcastChannel(`mock-exam-${attemptId}`);
      channel.onmessage = (ev) => {
        const d = ev.data as { type?: string; id?: string };
        if (!d || d.id === me) return;
        // Another tab says hello: tell it this exam is already open here.
        if (d.type === "hello" && decided) channel?.postMessage({ type: "here", id: me });
        // We said hello and an older tab answered: we are the second tab.
        if (d.type === "here" && !decided) {
          decide("second-tab");
          queue.current.push({ type: "second_tab", section });
          flush();
        }
      };
      channel.postMessage({ type: "hello", id: me });
    }
    const t = setTimeout(() => decide("ready"), 350);
    return () => {
      clearTimeout(t);
      channel?.close();
    };
  }, [attemptId, flush, section]);

  // ---- fullscreen + visibility -----------------------------------------
  const endAway = useCallback(() => {
    if (awaySince.current == null) return;
    const ms = Date.now() - awaySince.current;
    awaySince.current = null;
    report({ type: "away", ms, kind: "fullscreen" });
    if (ms >= LONG_AWAY_MS) setLongAway((n) => n + 1);
    setAway(false);
    onReturnRef.current?.();
  }, [report]);

  useEffect(() => {
    if (phase !== "active") return;

    function onFullscreen() {
      const inside = document.fullscreenElement === containerRef.current;
      if (!inside && awaySince.current == null) {
        awaySince.current = Date.now();
        setAway(true);
        // Take focus out of the content so typing cannot continue behind the overlay.
        (document.activeElement as HTMLElement | null)?.blur?.();
        onAwayRef.current?.();
      } else if (inside) {
        endAway();
      }
    }
    function onVisibility() {
      if (document.visibilityState === "hidden") {
        hiddenSince.current = Date.now();
        return;
      }
      if (hiddenSince.current == null) return;
      const ms = Date.now() - hiddenSince.current;
      hiddenSince.current = null;
      // A fullscreen departure already covers this time; count hidden-only switches.
      if (awaySince.current == null && ms >= HIDDEN_GRACE_MS) {
        report({ type: "away", ms, kind: "hidden" });
        if (ms >= LONG_AWAY_MS) setLongAway((n) => n + 1);
      }
    }
    document.addEventListener("fullscreenchange", onFullscreen);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreen);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [phase, endAway, report]);

  const [enterError, setEnterError] = useState<string | null>(null);
  async function enterFullscreen() {
    setEnterError(null);
    try {
      await containerRef.current?.requestFullscreen({ navigationUI: "hide" });
      if (phase !== "active") {
        report({ type: "device", ua: navigator.userAgent, screen: `${window.screen.width}x${window.screen.height}` });
        setPhase("active");
      }
    } catch {
      setEnterError("Your browser refused fullscreen. Use Chrome, Edge or Firefox on a computer, and allow fullscreen for this site.");
    }
  }

  // ---- render -------------------------------------------------------------
  const warning =
    longAway >= 2
      ? "Leaving the exam has been recorded several times. Your teacher will see this in your integrity report."
      : longAway === 1
        ? "Leaving the exam is recorded for your teacher. Stay in fullscreen until you finish."
        : "Stay in fullscreen for the whole section. Leaving is recorded.";

  return (
    <div
      ref={containerRef}
      className={cn("relative bg-background", phase === "active" && "h-full w-full overflow-y-auto", className)}
    >
      {phase === "checking" && <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted">Checking your device…</div>}

      {phase === "blocked-device" && (
        <Screen icon={<Laptop className="h-7 w-7" />} title="Use a laptop or desktop computer">
          The mock exam runs in fullscreen on a computer, like the real computer-delivered IELTS. Open this page in
          Chrome, Edge or Firefox on a laptop or desktop to continue. Phones and tablets are not supported.
        </Screen>
      )}

      {phase === "second-tab" && (
        <Screen icon={<TabsIcon className="h-7 w-7" />} title="This exam is already open in another tab">
          Close this tab and continue in the one you already have open. Opening the exam twice is recorded for your teacher.
        </Screen>
      )}

      {phase === "ready" && (
        <Screen icon={<Maximize className="h-7 w-7" />} title={reloaded ? `Continue ${sectionLabel}` : `Start ${sectionLabel}`}>
          <span className="block">
            {reloaded
              ? "The clock for this section has been running since you first opened it. Enter fullscreen to continue."
              : "This section runs in fullscreen. Leaving fullscreen hides the test until you return — the exam clock keeps running."}
          </span>
          <Button className="mt-5 h-11 w-full text-base" onClick={enterFullscreen}>
            <Maximize className="h-5 w-5" /> {reloaded ? "Return to fullscreen & continue" : "Enter fullscreen & begin"}
          </Button>
          {enterError && <span className="mt-3 block text-sm text-danger">{enterError}</span>}
        </Screen>
      )}

      {phase === "active" && (
        <ReportContext.Provider value={report}>
          {/* inert while away: no clicks, no focus, no typing reach the exam. */}
          <div className="h-full" inert={away}>
            {children}
          </div>
          {away && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background p-4" role="alertdialog" aria-modal="true" aria-label="Exam paused">
              <div className="w-full max-w-md rounded-2xl border border-warning/40 bg-surface p-6 text-center shadow-elevated">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-warning/10 text-warning">
                  <AlertTriangle className="h-7 w-7" />
                </div>
                <h2 className="mt-4 text-lg font-bold">You left fullscreen</h2>
                <p className="mt-2 text-sm text-muted">
                  The test is hidden until you return. <b className="text-foreground">The exam clock is still running.</b>
                  {section === "listening" && " The recording is paused and continues when you return."}
                </p>
                <p className={cn("mt-3 rounded-lg px-3 py-2 text-sm", longAway >= 1 ? "bg-warning/10 text-warning" : "bg-surface-2 text-muted")}>
                  {warning}
                </p>
                <Button className="mt-5 h-12 w-full text-base" onClick={enterFullscreen} autoFocus>
                  <Maximize className="h-5 w-5" /> Return to fullscreen
                </Button>
                {enterError && <p className="mt-3 text-sm text-danger">{enterError}</p>}
              </div>
            </div>
          )}
        </ReportContext.Provider>
      )}
    </div>
  );
}

function Screen({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[70vh] items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 text-center shadow-soft">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">{icon}</div>
        <h1 className="mt-4 text-xl font-bold">{title}</h1>
        <div className="mt-2 text-sm text-muted">{children}</div>
      </div>
    </div>
  );
}
