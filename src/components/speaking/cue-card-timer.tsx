"use client";

import { useEffect, useRef, useState } from "react";
import { Timer, Play, RotateCcw, FastForward } from "lucide-react";

type Phase = "idle" | "prep" | "speak" | "done";

const PREP_SECONDS = 60;
const SPEAK_SECONDS = 120;

function mmss(total: number) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** A short beep to mark phase changes (best-effort; ignored if blocked). */
function beep() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.value = 0.08;
    osc.start();
    osc.stop(ctx.currentTime + 0.18);
    osc.onended = () => ctx.close();
  } catch {
    /* no-op */
  }
}

export function CueCardTimer() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [left, setLeft] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function clear() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }
  useEffect(() => clear, []);

  function tick() {
    setLeft((prev) => {
      if (prev > 1) return prev - 1;
      // phase finished
      clear();
      setPhase((ph) => {
        if (ph === "prep") {
          beep();
          startInterval();
          setLeft(SPEAK_SECONDS);
          return "speak";
        }
        beep();
        return "done";
      });
      return 0;
    });
  }
  function startInterval() {
    clear();
    intervalRef.current = setInterval(tick, 1000);
  }

  function startPrep() {
    setPhase("prep");
    setLeft(PREP_SECONDS);
    startInterval();
  }
  function skipToSpeak() {
    clear();
    beep();
    setPhase("speak");
    setLeft(SPEAK_SECONDS);
    startInterval();
  }
  function reset() {
    clear();
    setPhase("idle");
    setLeft(0);
  }

  const label =
    phase === "prep"
      ? "Preparation"
      : phase === "speak"
        ? "Speaking"
        : phase === "done"
          ? "Time's up!"
          : "Exam timer";
  const tone =
    phase === "prep"
      ? "text-amber-500"
      : phase === "speak"
        ? "text-emerald-600"
        : phase === "done"
          ? "text-red-500"
          : "text-primary";
  const total = phase === "prep" ? PREP_SECONDS : SPEAK_SECONDS;
  const pct =
    phase === "prep" || phase === "speak"
      ? Math.round(((total - left) / total) * 100)
      : phase === "done"
        ? 100
        : 0;

  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-bold">
          <Timer className="h-5 w-5 text-primary" /> Part 2 timer
        </h2>
        <span className={`text-sm font-semibold ${tone}`}>{label}</span>
      </div>

      <div className="mt-3 text-center">
        <div className={`text-5xl font-bold tabular-nums ${tone}`}>
          {phase === "idle" ? "1:00" : mmss(left)}
        </div>
        <p className="mt-1 text-xs text-muted">
          {phase === "idle" && "1 minute to prepare, then 2 minutes to speak."}
          {phase === "prep" && "Make notes — speaking starts automatically."}
          {phase === "speak" && "Keep talking until the timer ends."}
          {phase === "done" && "Well done — that's a full 2-minute turn."}
        </p>
      </div>

      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className={`h-full rounded-full transition-all duration-1000 ${
            phase === "prep"
              ? "bg-amber-500"
              : phase === "done"
                ? "bg-red-500"
                : "bg-emerald-600"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {(phase === "idle" || phase === "done") && (
          <button
            type="button"
            onClick={startPrep}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            <Play className="h-4 w-4" /> {phase === "done" ? "Try again" : "Start"}
          </button>
        )}
        {phase === "prep" && (
          <button
            type="button"
            onClick={skipToSpeak}
            className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            <FastForward className="h-4 w-4" /> Skip to speaking
          </button>
        )}
        {(phase === "prep" || phase === "speak") && (
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-5 py-2 text-sm font-medium hover:bg-surface-2"
          >
            <RotateCcw className="h-4 w-4" /> Reset
          </button>
        )}
      </div>
    </section>
  );
}
