"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, Loader2, Maximize, Minimize } from "lucide-react";
import { submitMockSection } from "@/app/actions/mock";
import { Button } from "@/components/ui/button";

type Answers = Record<string, string>;

function parseAnswers(value: unknown): Answers {
  const out: Answers = {};
  if (!value || typeof value !== "object") return out;
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (/^\d+$/.test(k) && (typeof v === "string" || typeof v === "number")) out[k] = String(v);
  }
  return out;
}

/**
 * The CDI player for ONE section of a mock exam.
 *
 * Deliberately a separate component from TestRunner rather than a mode of it.
 * TestRunner's whole job after submit is to SHOW things — the band, the rating
 * delta, the streak, a link to the review — and every one of those is wrong
 * here. This one sends the answers to submitMockSection(), which grades and
 * stores them and returns no score, and then shows only "submitted".
 *
 * The file itself cannot reveal the score either: its answer key was stripped
 * when served, and /api/test-key refuses mock papers, so the bridge's key fetch
 * fails and the in-page report stays hidden (see that route).
 *
 * Only the "SUBMIT" message is accepted. "RESULT" comes from a keyless file that
 * scores itself; a mock paper always has a key (upload refuses one without).
 */
export function MockRunner({
  mockId,
  section,
  testId,
  title,
  nextHref,
  nextLabel,
}: {
  mockId: string;
  section: "listening" | "reading";
  testId: string;
  title: string;
  nextHref: string;
  nextLabel: string;
}) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const handled = useRef(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFs, setIsFs] = useState(false);

  useEffect(() => {
    const origin = window.location.origin;

    async function onMessage(e: MessageEvent) {
      if (e.origin !== origin) return;
      const d = e.data as Record<string, unknown> | null;
      if (!d || d.source !== "IELTS_CDI_TEST" || d.type !== "SUBMIT") return;
      if (handled.current) return;
      handled.current = true;
      setSaving(true);
      setError(null);

      const payload = (d.payload ?? {}) as Record<string, unknown>;
      const res = await submitMockSection(mockId, section, parseAnswers(payload.answers));
      setSaving(false);
      if (!res.ok) {
        // "Already submitted" means a previous submit landed; treat it as done
        // rather than stranding the student on an error.
        if (/already been submitted/i.test(res.error)) {
          setDone(true);
          return;
        }
        handled.current = false;
        setError(res.error);
        return;
      }
      // No router.refresh() here, on purpose: the server page redirects away from
      // a section that is already submitted, so refreshing would unmount this
      // runner and throw away the "submitted — continue" screen. Continuing
      // navigates to the next section, which renders fresh anyway.
      setDone(true);
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [mockId, section, router]);

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

  function goNext() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    router.push(nextHref);
  }

  const label = section === "listening" ? "Listening" : "Reading";

  return (
    <div ref={containerRef} className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-surface px-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
            Mock · {label}
          </span>
          <span className="truncate text-sm font-medium">{title}</span>
        </div>
        <button
          onClick={toggleFullscreen}
          className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-sm hover:bg-surface-2"
        >
          {isFs ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          <span className="hidden sm:inline">{isFs ? "Exit fullscreen" : "Fullscreen"}</span>
        </button>
      </div>

      <iframe
        src={`/api/test-html/${testId}`}
        title={title}
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
              Your answers are saved. Scores are not shown during the mock — your teacher releases
              the full result once everything is marked.
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
