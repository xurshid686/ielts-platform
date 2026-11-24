"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Crown, Loader2 } from "lucide-react";
import { startTrialAction } from "@/app/actions/premium";

/**
 * One-time offer shown after a student's first result: every Premium reading
 * and listening test for TRIAL_DAYS days. Tests only — no mock entry, no AI
 * writing checks (owner, 2026-11-23).
 */
export function TrialOffer({
  days,
  className = "",
  heading,
}: {
  days: number;
  className?: string;
  /** Overrides the "You've unlocked…" line (the lock screen asks instead). */
  heading?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <div className={`rounded-2xl border border-premium/30 bg-premium/5 p-5 text-sm ${className}`}>
        <p className="font-semibold">Your {days}-day trial has started. Every Premium test is open.</p>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border border-premium/30 bg-premium/5 p-5 shadow-soft ${className}`}>
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-premium-gradient text-white">
          <Crown className="h-5 w-5" />
        </div>
        <div className="min-w-0 text-left">
          <p className="font-semibold">{heading ?? `You've unlocked a ${days}-day free Premium trial`}</p>
          <p className="mt-1 text-sm text-muted">
            Every Premium reading and listening test, free for {days} days. No payment, nothing to cancel.
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setError(null);
              start(async () => {
                const res = await startTrialAction();
                if (res.ok) {
                  setDone(true);
                  router.refresh();
                } else setError(res.error);
              });
            }}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-premium-gradient px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-60"
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Start my free trial
          </button>
          {error && <p className="mt-2 text-sm text-danger">{error}</p>}
        </div>
      </div>
    </div>
  );
}
