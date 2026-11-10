"use client";

import { useSyncExternalStore } from "react";
import { Crown, Send, X } from "lucide-react";

const EVENT = "premium-renewal-dismissed";

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
}

function read(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false; // Storage blocked: just show the banner.
  }
}

/**
 * A slim reminder for a member whose Premium ends within a week, or ended
 * within the last month. The server decides whether to render it at all
 * (membershipStage in lib/premium.ts); this component only owns "dismissed".
 *
 * Dismissal is remembered per membership end date, in this browser only, so a
 * renewed membership that is later about to run out is announced again.
 */
export function PremiumRenewalBanner({
  stage,
  days,
  until,
  renewUrl,
}: {
  stage: "expiring" | "lapsed";
  days: number;
  until: string;
  renewUrl: string;
}) {
  const key = `premium-renewal-dismissed:${stage}:${until}`;
  // Hidden on the server and until hydration, so a dismissed banner never flashes.
  const dismissed = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => true,
  );
  if (dismissed) return null;

  function dismiss() {
    try {
      window.localStorage.setItem(key, "1");
    } catch {
      // Nothing to remember it in; it will show again on the next page.
    }
    window.dispatchEvent(new Event(EVENT));
  }

  const headline =
    stage === "expiring"
      ? days <= 1
        ? "Your Premium ends today."
        : `Your Premium ends in ${days} days.`
      : days === 0
        ? "Your Premium ended today."
        : `Your Premium ended ${days} day${days === 1 ? "" : "s"} ago.`;

  return (
    <div
      role="status"
      className="mb-6 flex flex-col gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="flex min-w-0 items-start gap-2">
        <Crown className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
        <span>
          <strong className="font-semibold">{headline}</strong>{" "}
          <span className="text-muted">
            {stage === "expiring"
              ? "Renew now to keep the premium tests and instant mock entry."
              : "Renew to open the premium tests and instant mock entry again."}
          </span>
        </span>
      </p>
      <div className="flex shrink-0 items-center gap-2">
        <a
          href={renewUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-amber-400 to-yellow-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95"
        >
          <Send className="h-4 w-4" /> Renew Premium
        </a>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
