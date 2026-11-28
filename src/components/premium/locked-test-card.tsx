"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Crown, Gift, Loader2 } from "lucide-react";
import { claimPassAction, startTrialAction } from "@/app/actions/premium";

/**
 * The actions on a locked Premium test: ONE filled button, chosen in this order
 * (owner, 2026-11-28 — the page used to stack four boxes with three filled
 * buttons and nothing said which to press):
 *
 *   1. a weekly pass is left  -> "Open this test free" (opens THIS test, and
 *      keeps the one-time trial for later);
 *   2. the trial is untaken   -> "Start my free trial";
 *   3. otherwise              -> "Get Premium" (to /premium, never Telegram).
 *
 * Whatever is not the lead appears as a plain text link underneath.
 * The e2e scripts (e2e-lock-trial, e2e-passes-trial) read the button names and
 * the "N of 3" / "used this week" / "Try every Premium test free for N days"
 * strings, so keep them word for word.
 */
export function LockedTestCard({
  testId,
  passesLeft,
  perWeek,
  trialDays,
  priceLine,
}: {
  testId: string;
  /** Weekly passes left, or null when passes do not apply to this test. */
  passesLeft: number | null;
  perWeek: number;
  /** Trial length in days when the student may still start it, else null. */
  trialDays: number | null;
  priceLine: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<"pass" | "trial" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trialStarted, setTrialStarted] = useState(false);

  const passLeads = passesLeft != null && passesLeft > 0;
  const trialLeads = !passLeads && trialDays != null;
  const premiumLeads = !passLeads && !trialLeads;
  const passesUsed = passesLeft != null && passesLeft <= 0;
  const hasSecondary = passesUsed || !premiumLeads;

  function run(kind: "pass" | "trial") {
    setError(null);
    setBusy(kind);
    start(async () => {
      const res = kind === "pass" ? await claimPassAction(testId) : await startTrialAction();
      if (res.ok) {
        if (kind === "trial") setTrialStarted(true);
        router.refresh();
      } else setError(res.error);
      setBusy(null);
    });
  }

  if (trialStarted) {
    return (
      <p className="mt-6 rounded-xl bg-premium/10 p-4 text-sm font-semibold">
        Your {trialDays}-day trial has started. Every Premium test is open.
      </p>
    );
  }

  const spinner = <Loader2 className="h-4 w-4 animate-spin" />;
  const filled =
    "inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold shadow-sm disabled:opacity-60";
  const textLink =
    "inline-flex items-center gap-1 font-semibold text-primary underline-offset-4 hover:underline disabled:opacity-60";

  return (
    <div className="mt-6 text-left">
      {passLeads && (
        <>
          <button
            type="button"
            disabled={pending}
            onClick={() => run("pass")}
            className={`${filled} bg-primary text-primary-foreground hover:brightness-95`}
          >
            {busy === "pass" ? spinner : <Gift className="h-4 w-4" />}
            Open this test free
          </button>
          <p className="mt-2 text-center text-sm text-muted">
            You have{" "}
            <strong className="tabular-nums text-foreground">
              {passesLeft} of {perWeek}
            </strong>{" "}
            free Premium tests left this week. A test you open stays yours.
          </p>
        </>
      )}

      {trialLeads && (
        <>
          <p className="mb-3 text-center font-semibold">
            Try every Premium test free for {trialDays} days
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() => run("trial")}
            className={`${filled} bg-premium-gradient text-white hover:opacity-95`}
          >
            {busy === "trial" ? spinner : <Crown className="h-4 w-4" />}
            Start my free trial
          </button>
          <p className="mt-2 text-center text-sm text-muted">
            Every Premium reading and listening test. No payment, nothing to cancel.
          </p>
        </>
      )}

      {premiumLeads && (
        <>
          <Link href="/premium" className={`${filled} bg-premium-gradient text-white hover:opacity-95`}>
            <Crown className="h-4 w-4" /> Get Premium <ArrowRight className="h-4 w-4" />
          </Link>
          <p className="mt-2 text-center text-sm text-muted tabular-nums">{priceLine}</p>
        </>
      )}

      {error && <p className="mt-2 text-center text-sm text-danger">{error}</p>}

      {/* Everything that is not the lead: plain text, never a second button. */}
      {hasSecondary && (
      <div className="mt-5 space-y-3 border-t border-border pt-4 text-sm">
        {passesUsed && (
          <p className="text-muted">
            You&apos;ve used this week&apos;s {perWeek} free Premium tests. They come back on Monday.
          </p>
        )}
        {passLeads && trialDays != null && (
          <p className="text-muted">
            Try every Premium test free for {trialDays} days.{" "}
            <button type="button" disabled={pending} onClick={() => run("trial")} className={textLink}>
              {busy === "trial" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Start my free trial
            </button>
          </p>
        )}
        {!premiumLeads && (
          <p className="text-muted">
            Want every test, every day?{" "}
            <Link href="/premium" className={textLink}>
              Get Premium <ArrowRight className="h-3.5 w-3.5" />
            </Link>{" "}
            <span className="tabular-nums">· {priceLine}</span>
          </p>
        )}
      </div>
      )}
    </div>
  );
}
