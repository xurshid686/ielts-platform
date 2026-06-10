"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Flame, Loader2, Maximize, Minimize, Trophy, X, ArrowLeft, TrendingUp, TrendingDown } from "lucide-react";
import { saveResult, type RatingOutcome } from "@/app/actions/results";
import { Button } from "@/components/ui/button";
import { tierForRating } from "@/lib/rating";

type Props = {
  testId: string;
  title: string;
  skill: "reading" | "listening";
  // True when the test is graded server-side (has a stored answer key). The
  // manual "type your score" fallback is hidden for these — the score is
  // computed from the user's actual answers and can't be hand-entered.
  graded?: boolean;
};

type Saved = {
  band: number;
  raw: number;
  total: number;
  streak: number;
  longest_streak: number;
  xp: number;
  firstToday: boolean;
  rating: RatingOutcome | null;
};

type Answers = Record<string, string>;

function parseAnswers(value: unknown): Answers | undefined {
  if (!value || typeof value !== "object") return undefined;
  const out: Answers = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (/^\d+$/.test(k) && (typeof v === "string" || typeof v === "number")) {
      out[k] = String(v);
    }
  }
  return Object.keys(out).length ? out : undefined;
}

function parseMessage(
  data: unknown,
): { raw: number; total: number; band?: number; answers?: Answers } | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (d.source !== "IELTS_CDI_TEST" || d.type !== "RESULT") return null;
  const p = d.payload as Record<string, unknown> | undefined;
  if (!p) return null;
  const raw = Number(p.raw);
  const total = Number(p.total);
  if (!Number.isFinite(raw) || !Number.isFinite(total) || total <= 0) return null;
  const band = Number(p.band);
  return {
    raw,
    total,
    band: Number.isFinite(band) && band > 0 ? band : undefined,
    answers: parseAnswers(p.answers),
  };
}

export function TestRunner({ testId, title, skill, graded = false }: Props) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const handled = useRef(false);
  const celebrated = useRef(false);
  // When the test iframe first loads — used to measure completion time.
  // Set on mount (and refined on iframe load) to keep render pure.
  const startedAt = useRef<number>(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [isFs, setIsFs] = useState(false);

  const srcUrl = `/api/test-html/${testId}`;
  const expectedOrigin = typeof window !== "undefined" ? window.location.origin : "";

  async function submit(raw: number, total: number, band?: number, answers?: Answers) {
    if (handled.current) return;
    handled.current = true;
    setSaving(true);
    setError(null);
    const durationSeconds = Math.max(0, Math.round((Date.now() - startedAt.current) / 1000));
    const res = await saveResult({ testId, skill, raw, total, band, answers, durationSeconds });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      handled.current = false;
      return;
    }
    if (res.deduped) return; // already counted moments ago — stay silent
    // Save quietly: just a small badge. The celebration waits until Exit.
    setSaved({
      band: res.band,
      raw,
      total,
      streak: res.streak,
      longest_streak: res.longest_streak,
      xp: res.xp,
      firstToday: res.firstToday,
      rating: res.rating,
    });
    router.refresh();
  }

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (expectedOrigin && e.origin !== expectedOrigin) return;
      const parsed = parseMessage(e.data);
      if (!parsed) return;
      submit(parsed.raw, parsed.total, parsed.band, parsed.answers);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expectedOrigin]);

  useEffect(() => {
    startedAt.current = Date.now();
  }, []);

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

  function doExit() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    router.push(`/${skill}`);
  }

  // Exit shows the streak celebration only on the FIRST completed test of the day.
  function exit() {
    if (saved && saved.firstToday && !celebrated.current) {
      celebrated.current = true;
      setShowCelebration(true);
      return;
    }
    doExit();
  }

  return (
    <div ref={containerRef} className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-surface px-3">
        <div className="flex min-w-0 items-center gap-2">
          <button
            onClick={exit}
            className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-sm text-muted hover:bg-surface-2 hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Exit
          </button>
          <span className="truncate text-sm font-medium">{title}</span>
          {saved && (
            <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
              <CheckCircle2 className="h-3.5 w-3.5" /> Saved · Band {saved.band}
            </span>
          )}
          {saved?.rating?.rated && (
            <span
              className={`hidden items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums sm:inline-flex ${
                saved.rating.delta >= 0
                  ? "bg-primary/10 text-primary"
                  : "bg-danger/10 text-danger"
              }`}
            >
              {saved.rating.delta >= 0 ? (
                <TrendingUp className="h-3.5 w-3.5" />
              ) : (
                <TrendingDown className="h-3.5 w-3.5" />
              )}
              {saved.rating.delta >= 0 ? `+${saved.rating.delta}` : saved.rating.delta} ·{" "}
              {saved.rating.rating} {tierForRating(saved.rating.rating ?? 0).emoji}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!graded && (
            <button
              onClick={() => setManual((m) => !m)}
              className="inline-flex h-8 items-center rounded-lg px-2 text-xs text-muted hover:bg-surface-2 hover:text-foreground"
            >
              <span className="sm:hidden">Manual score</span>
              <span className="hidden sm:inline">Score didn&apos;t save?</span>
            </button>
          )}
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
        src={srcUrl}
        title={title}
        className="min-h-0 w-full flex-1 bg-white"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
        onLoad={() => {
          startedAt.current = Date.now();
        }}
      />

      {manual && !saved && (
        <ManualEntry onSubmit={(raw, total) => submit(raw, total)} disabled={saving} onClose={() => setManual(false)} />
      )}

      {error && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-lg border border-danger/30 bg-surface px-4 py-2 text-sm text-danger shadow-lg">
          {error}
        </div>
      )}

      {saving && (
        <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm shadow-lg">
          <Loader2 className="h-4 w-4 animate-spin" /> Saving your result…
        </div>
      )}

      {showCelebration && saved && (
        <Celebration saved={saved} skill={skill} onClose={doExit} />
      )}
    </div>
  );
}

function ManualEntry({
  onSubmit,
  disabled,
  onClose,
}: {
  onSubmit: (raw: number, total: number) => void;
  disabled: boolean;
  onClose: () => void;
}) {
  const [raw, setRaw] = useState("");
  const [total, setTotal] = useState("40");
  return (
    <div className="absolute left-3 right-3 top-14 z-10 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-4 shadow-xl sm:left-auto">
      <label className="text-sm">
        <span className="mb-1 block text-muted">Correct</span>
        <input type="number" min={0} value={raw} onChange={(e) => setRaw(e.target.value)} className="h-9 w-24 rounded-lg border border-border bg-surface-2 px-3" />
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-muted">Out of</span>
        <input type="number" min={1} value={total} onChange={(e) => setTotal(e.target.value)} className="h-9 w-24 rounded-lg border border-border bg-surface-2 px-3" />
      </label>
      <Button size="sm" disabled={disabled || raw === ""} onClick={() => onSubmit(Number(raw), Number(total))}>
        Save
      </Button>
      <button onClick={onClose} className="text-muted hover:text-foreground" aria-label="Close">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function Celebration({
  saved,
  skill,
  onClose,
}: {
  saved: Saved;
  skill: string;
  onClose: () => void;
}) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="relative w-full max-w-sm rounded-2xl border border-border bg-surface p-6 text-center shadow-xl">
        <button onClick={onClose} className="absolute right-4 top-4 text-muted hover:text-foreground" aria-label="Close">
          <X className="h-5 w-5" />
        </button>
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-3xl">🔥</div>
        <h3 className="mt-4 text-lg font-bold">Streak extended!</h3>
        <p className="mt-1 text-5xl font-extrabold text-primary">{saved.streak}</p>
        <p className="text-sm text-muted">day streak · keep it going tomorrow!</p>
        <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl bg-surface-2 p-3">
            <p className="flex items-center justify-center gap-1 font-semibold">
              <Trophy className="h-4 w-4 text-warning" /> {saved.longest_streak}
            </p>
            <p className="text-xs text-muted">longest streak</p>
          </div>
          <div className="rounded-xl bg-surface-2 p-3">
            <p className="flex items-center justify-center gap-1 font-semibold">
              <Flame className="h-4 w-4 text-warning" /> {saved.xp}
            </p>
            <p className="text-xs text-muted">total XP</p>
          </div>
        </div>

        {saved.rating?.rated && saved.rating.rating != null && (
          <div className="mt-3 flex items-center justify-between rounded-xl bg-primary/5 px-4 py-3 text-sm">
            <span className="flex items-center gap-2 font-medium">
              <span className="text-lg">{tierForRating(saved.rating.rating).emoji}</span>
              {tierForRating(saved.rating.rating).label} · {saved.rating.rating}
            </span>
            <span
              className={`inline-flex items-center gap-1 font-semibold tabular-nums ${
                saved.rating.delta >= 0 ? "text-success" : "text-danger"
              }`}
            >
              {saved.rating.delta >= 0 ? (
                <TrendingUp className="h-4 w-4" />
              ) : (
                <TrendingDown className="h-4 w-4" />
              )}
              {saved.rating.delta >= 0 ? `+${saved.rating.delta}` : saved.rating.delta}
              {saved.rating.points > 0 && (
                <span className="ml-1 text-muted">· {saved.rating.points} pts</span>
              )}
            </span>
          </div>
        )}
        <Button className="mt-6 w-full" onClick={onClose}>
          Back to {skill}
        </Button>
      </div>
    </div>
  );
}
