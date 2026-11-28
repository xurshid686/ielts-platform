import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { SkillSnapshot } from "@/lib/dashboard-shared";

// Three skills on one band ruler (4-9), with the target as a tick. Speaking is left out on
// purpose (not sold, owner 2026-11-28). Rendered inside the Today hero (its third zone), so
// it has no card of its own.

const META = {
  reading: { label: "Reading", bar: "bg-skill-reading", href: "/reading" },
  listening: { label: "Listening", bar: "bg-skill-listening", href: "/listening" },
  writing: { label: "Writing", bar: "bg-skill-writing", href: "/writing" },
} as const;

const MIN = 4;
const MAX = 9;
const pct = (b: number) => Math.max(0, Math.min(100, ((b - MIN) / (MAX - MIN)) * 100));

export function SkillsSnapshot({
  skills,
  overall,
  target,
  first = false,
}: {
  skills: SkillSnapshot[];
  overall: number | null;
  target: number | null;
  /** No results yet: say where the bands will come from instead of three empty bars. */
  first?: boolean;
}) {
  return (
    <div aria-label="Your bands" data-bands className="flex h-full flex-col">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Your bands</h2>
        <p className="text-sm">
          <span className="text-muted">Overall </span>
          <span className="font-display text-xl font-bold tabular-nums">{overall != null ? overall.toFixed(1) : "–"}</span>
          {target != null && <span className="text-muted tabular-nums"> → {target.toFixed(1)}</span>}
        </p>
      </div>

      {first ? (
        <p className="mt-3 text-sm text-muted">
          Finish your first test and your Reading, Listening and Writing bands appear here, next to the band you&apos;re aiming for.
        </p>
      ) : (
        <>
          <ul className="mt-4 space-y-3">
            {skills.map((s) => {
              const m = META[s.key];
              return (
                <li key={s.key}>
                  <Link href={m.href} className="group block rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium group-hover:text-primary">{m.label}</span>
                      <span className="tabular-nums">
                        {s.band != null ? (
                          <span className="font-semibold">{s.band.toFixed(1)}</span>
                        ) : (
                          <span className="text-xs text-muted">{s.key === "writing" ? "Write an essay to see it" : "No tests yet"}</span>
                        )}
                      </span>
                    </div>
                    <div className="relative h-2 rounded-full bg-surface-2">
                      {s.band != null && <div className={`h-full rounded-full ${m.bar}`} style={{ width: `${pct(s.band)}%` }} />}
                      {target != null && (
                        <span
                          aria-hidden
                          className="absolute -top-1 h-4 w-0.5 rounded-full bg-foreground/60"
                          style={{ left: `calc(${pct(target)}% - 1px)` }}
                        />
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="mt-2 flex justify-between text-[11px] tabular-nums text-muted" aria-hidden>
            {[4, 5, 6, 7, 8, 9].map((n) => (
              <span key={n}>{n}</span>
            ))}
          </div>
        </>
      )}

      <Link
        href="/dashboard/progress"
        className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        {target == null && !first ? "Set a target band" : "See your progress"} <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
