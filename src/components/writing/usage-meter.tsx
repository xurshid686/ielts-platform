import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CheckQuota } from "@/lib/writing-ai-shared";

/**
 * "7 of 10 AI checks left this month" — always visible to a Premium student, on
 * the Writing page and beside the Check button, so the allowance is never a
 * surprise. Server-renderable; the client panel renders the same markup after a
 * check changes the count.
 */
export function UsageMeter({ quota, className }: { quota: CheckQuota; className?: string }) {
  const empty = quota.left === 0;
  return (
    <div
      data-ai-meter
      className={cn(
        "inline-flex flex-col gap-1.5 rounded-xl border px-3 py-2 text-sm",
        empty ? "border-warning/40 bg-warning/5" : "border-border bg-surface",
        className,
      )}
    >
      <span className="inline-flex items-center gap-1.5 font-semibold">
        <Sparkles className="h-4 w-4 text-primary" aria-hidden />
        <span className="tabular-nums">
          {quota.left} of {quota.limit}
        </span>{" "}
        AI checks left this month
      </span>
      <span
        role="progressbar"
        aria-label="AI checks used this month"
        aria-valuemin={0}
        aria-valuemax={quota.limit}
        aria-valuenow={quota.used}
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
      >
        <span
          className={cn("block h-full rounded-full", empty ? "bg-warning" : "bg-primary")}
          style={{ width: `${Math.min(100, (quota.used / quota.limit) * 100)}%` }}
        />
      </span>
      <span className="text-xs text-muted">Renews on {quota.renews}</span>
    </div>
  );
}
