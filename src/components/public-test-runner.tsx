"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, Lock, Maximize, Minimize, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  testId: string;
  title: string;
  skill: "reading" | "listening";
};

type Answers = Record<string, string>;
type Score = { raw: number; total: number; band: number };

function parseAnswers(value: unknown): Answers {
  if (!value || typeof value !== "object") return {};
  const out: Answers = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (/^\d+$/.test(k) && (typeof v === "string" || typeof v === "number")) out[k] = String(v);
  }
  return out;
}

export function PublicTestRunner({ testId, title, skill }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const handled = useRef(false);
  const [grading, setGrading] = useState(false);
  const [score, setScore] = useState<Score | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isFs, setIsFs] = useState(false);

  const expectedOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const nextPath = `/practice/${testId}`;
  const registerHref = `/register?next=${nextPath}`;
  const loginHref = `/login?next=${nextPath}`;

  useEffect(() => {
    async function grade(answers: Answers) {
      if (handled.current) return;
      handled.current = true;
      setGrading(true);
      setError(null);
      try {
        const res = await fetch("/api/public-grade", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ testId, skill, answers }),
        });
        if (!res.ok) throw new Error("grade failed");
        const data = (await res.json()) as Score;
        setScore({ raw: data.raw, total: data.total, band: data.band });
      } catch {
        setError("Something went wrong grading your test. Please try again.");
        handled.current = false;
      } finally {
        setGrading(false);
      }
    }

    function onMessage(e: MessageEvent) {
      if (expectedOrigin && e.origin !== expectedOrigin) return;
      const d = e.data as { source?: string; type?: string; payload?: { answers?: unknown } } | null;
      if (!d || d.source !== "IELTS_CDI_TEST" || d.type !== "PUBLIC_SUBMIT") return;
      grade(parseAnswers(d.payload?.answers));
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [testId, skill, expectedOrigin]);

  useEffect(() => {
    function onFs() {
      setIsFs(document.fullscreenElement === containerRef.current);
    }
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await containerRef.current?.requestFullscreen();
    } catch {
      /* denied / unsupported */
    }
  }

  return (
    <div ref={containerRef} className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-surface px-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium">{title}</span>
          <span className="hidden items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary sm:inline-flex">
            <Sparkles className="h-3.5 w-3.5" /> Free practice
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={registerHref}
            className="hidden h-8 items-center rounded-lg px-2.5 text-xs font-medium text-muted hover:bg-surface-2 hover:text-foreground sm:inline-flex"
          >
            Sign up to save
          </Link>
          <button
            onClick={toggleFullscreen}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-sm hover:bg-surface-2"
          >
            {isFs ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            <span className="hidden sm:inline">{isFs ? "Exit fullscreen" : "Fullscreen"}</span>
          </button>
        </div>
      </div>

      <iframe
        src={`/api/public-test-html/${testId}`}
        title={title}
        className="min-h-0 w-full flex-1 bg-white"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
      />

      {grading && (
        <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm shadow-lg">
          <Loader2 className="h-4 w-4 animate-spin" /> Grading your test…
        </div>
      )}

      {error && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-lg border border-danger/30 bg-surface px-4 py-2 text-sm text-danger shadow-lg">
          {error}
        </div>
      )}

      {score && <ResultOverlay score={score} registerHref={registerHref} loginHref={loginHref} />}
    </div>
  );
}

function ResultOverlay({
  score,
  registerHref,
  loginHref,
}: {
  score: Score;
  registerHref: string;
  loginHref: string;
}) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 text-center shadow-xl">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/10 text-success">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <h3 className="mt-4 text-lg font-bold">Test complete</h3>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-surface-2 p-4">
            <p className="text-3xl font-extrabold tabular-nums">
              {score.raw}
              <span className="text-base font-medium text-muted">/{score.total}</span>
            </p>
            <p className="text-xs text-muted">correct</p>
          </div>
          <div className="rounded-xl bg-primary/5 p-4">
            <p className="text-3xl font-extrabold tabular-nums text-primary">{score.band.toFixed(1)}</p>
            <p className="text-xs text-muted">estimated band</p>
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-primary/20 bg-primary/5 p-4 text-left">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Lock className="h-4 w-4 text-primary" /> Create a free account to unlock
          </p>
          <ul className="mt-2 space-y-1 text-xs text-muted">
            <li>• Save this result &amp; track your band over time</li>
            <li>• See the full answer review with explanations</li>
            <li>• Build a daily streak and climb the leaderboard</li>
          </ul>
        </div>

        <Link href={registerHref}>
          <Button className="mt-5 w-full">Create a free account</Button>
        </Link>
        <p className="mt-3 text-xs text-muted">
          Already have one?{" "}
          <Link href={loginHref} className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
