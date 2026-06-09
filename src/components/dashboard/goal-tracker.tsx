"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Target, Pencil, Check, ArrowRight, Trophy, Loader2, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { setTargetBand } from "@/app/actions/profile";

export type GoalSkill = {
  key: string;
  title: string;
  href: string;
  avg: number | null;
};

const BAND_OPTIONS = [4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9];
const SCALE_MIN = 4;
const SCALE_MAX = 9;
const pct = (v: number) =>
  Math.max(0, Math.min(100, ((v - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100));

export function GoalTracker({
  target,
  overall,
  skills,
}: {
  target: number | null;
  overall: number | null;
  skills: GoalSkill[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(target == null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save(band: number | null) {
    setError(null);
    startTransition(async () => {
      const res = await setTargetBand(band);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  // ----- Edit / set-goal view -----
  if (editing) {
    return (
      <Card>
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-medium text-muted">
            <Target className="h-4 w-4" /> {target == null ? "Set your target band" : "Change target"}
          </h3>
          {target != null && (
            <button
              onClick={() => setEditing(false)}
              className="text-muted hover:text-foreground"
              aria-label="Cancel"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <p className="mt-1 text-sm text-muted">
          Pick the band you&apos;re aiming for — we&apos;ll track your progress and tell you what to
          focus on.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {BAND_OPTIONS.map((b) => {
            const on = target === b;
            return (
              <button
                key={b}
                disabled={pending}
                onClick={() => save(b)}
                className={`rounded-full px-3.5 py-1.5 text-sm font-semibold tabular-nums transition-colors disabled:opacity-50 ${
                  on
                    ? "bg-primary text-primary-foreground"
                    : "bg-surface-2 text-foreground hover:bg-primary/10 hover:text-primary"
                }`}
              >
                {b.toFixed(1)}
              </button>
            );
          })}
        </div>
        {pending && (
          <p className="mt-3 inline-flex items-center gap-2 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Saving…
          </p>
        )}
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        {target != null && (
          <button
            onClick={() => save(null)}
            disabled={pending}
            className="mt-4 text-xs font-medium text-muted underline hover:text-danger disabled:opacity-50"
          >
            Remove goal
          </button>
        )}
      </Card>
    );
  }

  // ----- Progress view -----
  const gap = overall != null && target != null ? +(target - overall).toFixed(1) : null;
  const reached = gap != null && gap <= 0;

  // Study plan: skills below target first (lowest / not-started highest priority).
  const ranked = [...skills].sort((a, b) => {
    const av = a.avg ?? -1;
    const bv = b.avg ?? -1;
    return av - bv;
  });
  const focus = target != null ? ranked.find((s) => (s.avg ?? -1) < target) : undefined;

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-medium text-muted">
            <Target className="h-4 w-4" /> Target band
          </h3>
          <p className="mt-1 flex items-end gap-2">
            <span className="text-4xl font-extrabold tabular-nums text-primary">
              {target?.toFixed(1)}
            </span>
            {overall != null && (
              <span className="mb-1 text-sm text-muted">
                now <strong className="text-foreground tabular-nums">{overall.toFixed(1)}</strong>
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => setEditing(true)}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-muted hover:bg-surface-2 hover:text-foreground"
        >
          <Pencil className="h-3.5 w-3.5" /> Edit
        </button>
      </div>

      {/* Overall progress bar with target marker */}
      <div className="relative mt-4 h-2.5 rounded-full bg-surface-2">
        {overall != null && (
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-brand-gradient"
            style={{ width: `${pct(overall)}%` }}
          />
        )}
        {target != null && (
          <div
            className="absolute -top-1 h-4.5 w-0.5 -translate-x-1/2 bg-foreground"
            style={{ left: `${pct(target)}%`, height: "1.1rem", marginTop: "-0.3rem" }}
            title={`Target ${target.toFixed(1)}`}
          />
        )}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-muted">
        <span>{SCALE_MIN.toFixed(1)}</span>
        <span>{SCALE_MAX.toFixed(1)}</span>
      </div>

      {/* Gap / reached message */}
      {overall == null ? (
        <p className="mt-2 text-sm text-muted">
          Take a test to start tracking progress toward your goal.
        </p>
      ) : reached ? (
        <p className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-success">
          <Trophy className="h-4 w-4" /> Goal reached — aim higher? 🎉
        </p>
      ) : (
        <p className="mt-2 text-sm">
          <strong className="tabular-nums">{gap}</strong> band to go.
          {focus && (
            <>
              {" "}Focus on{" "}
              <Link href={focus.href} className="font-medium text-primary hover:underline">
                {focus.title}
              </Link>{" "}
              next.
            </>
          )}
        </p>
      )}

      {/* Per-skill study plan */}
      {target != null && (
        <div className="mt-4 space-y-2 border-t border-border pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Study plan</p>
          {ranked.map((s) => {
            const done = s.avg != null && s.avg >= target;
            const started = s.avg != null;
            return (
              <Link
                key={s.key}
                href={s.href}
                className="flex items-center gap-3 rounded-lg px-1 py-1 text-sm hover:bg-surface-2/60"
              >
                <span className="w-20 shrink-0 font-medium">{s.title}</span>
                <span className="relative h-1.5 flex-1 rounded-full bg-surface-2">
                  {started && (
                    <span
                      className={`absolute inset-y-0 left-0 rounded-full ${done ? "bg-success" : "bg-primary/60"}`}
                      style={{ width: `${pct(s.avg as number)}%` }}
                    />
                  )}
                  <span
                    className="absolute -top-0.5 h-2.5 w-px -translate-x-1/2 bg-foreground/50"
                    style={{ left: `${pct(target)}%` }}
                  />
                </span>
                <span
                  className={`w-24 shrink-0 text-right text-xs font-medium ${
                    done ? "text-success" : started ? "text-warning" : "text-muted"
                  }`}
                >
                  {!started ? (
                    "Not started"
                  ) : done ? (
                    <span className="inline-flex items-center justify-end gap-1">
                      <Check className="h-3.5 w-3.5" /> {s.avg!.toFixed(1)}
                    </span>
                  ) : (
                    `${(target - (s.avg as number)).toFixed(1)} to go`
                  )}
                </span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted" />
              </Link>
            );
          })}
        </div>
      )}
    </Card>
  );
}
