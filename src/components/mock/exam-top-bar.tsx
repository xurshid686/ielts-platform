"use client";

import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The one top bar every mock screen uses (0054): section and paper on the left,
 * the OFFICIAL clock in the middle, the section's action on the right. The CDI
 * paper's own timer is hidden by the mock adapter, so this is the only clock a
 * student sees.
 */
export function ExamTopBar({
  label,
  title,
  center,
  right,
}: {
  label: string;
  title?: string;
  center: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="grid h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-border bg-surface px-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">Mock · {label}</span>
        {title && <span className="truncate text-sm font-medium">{title}</span>}
      </div>
      <div className="flex justify-center">{center}</div>
      <div className="flex min-w-0 items-center justify-end gap-2">{right}</div>
    </div>
  );
}

/** mm:ss (or h:mm:ss) countdown; red in the last five minutes. */
export function ExamClock({ remainingMs, idle }: { remainingMs: number | null; idle?: string }) {
  if (remainingMs == null) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-1.5 font-mono text-base font-semibold tabular-nums text-muted">
        <Clock className="h-4 w-4" /> {idle}
      </span>
    );
  }
  const total = Math.max(0, Math.floor(remainingMs / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const text = h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return (
    <span
      role="timer"
      aria-label="Time left in this section"
      title="Official time left for this section. It keeps running if you leave or reload."
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-mono text-lg font-bold tabular-nums",
        remainingMs < 5 * 60_000 ? "bg-danger/10 text-danger" : "bg-surface-2 text-foreground",
      )}
    >
      <Clock className="h-4 w-4" /> {text}
    </span>
  );
}

export function minutesLabel(minutes: number) {
  return `${String(minutes).padStart(2, "0")}:00`;
}
