"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, Lock, Sparkles } from "lucide-react";
import { checkPracticeWriting } from "@/app/actions/writing-ai";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AiFeedbackCard } from "@/components/writing/ai-feedback-card";
import { UsageMeter } from "@/components/writing/usage-meter";
import type { AiTaskResult, CheckQuota } from "@/lib/writing-ai-shared";

/**
 * "Check my writing with AI" for a SUBMITTED practice attempt.
 *
 * Premium only (`access`): a free student can still save and hand in, and sees a
 * locked button that leads to /premium. The check runs on the server from the
 * stored answer — nothing the browser holds is sent — and a failed check costs
 * nothing, which the copy says so nobody hesitates to retry.
 */
export function CheckMyWriting({
  attemptId,
  kind,
  access,
  quota: initialQuota,
  initial,
}: {
  attemptId: string;
  kind: "task1" | "task2" | "full";
  access: "ok" | "locked";
  /** Null for an admin (their checks are not counted). */
  quota: CheckQuota | null;
  initial: { results: AiTaskResult[]; pending: boolean } | null;
}) {
  const [results, setResults] = useState<AiTaskResult[]>(initial?.results ?? []);
  const [quota, setQuota] = useState<CheckQuota | null>(initialQuota);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await checkPracticeWriting(attemptId);
      if (res.ok) {
        setResults(res.check.results);
        setQuota(res.quota);
      } else {
        setError(res.error);
      }
    } catch {
      setError("Couldn't reach the server. It did not use one of your checks — please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (results.length) {
    return (
      <div className="space-y-4">
        <AiFeedbackCard
          results={results}
          showBands
          heading="AI feedback on your writing"
          note="An AI estimate to guide your practice — not an official IELTS result."
        />
        {quota && <UsageMeter quota={quota} />}
      </div>
    );
  }

  if (access === "locked") {
    return (
      <Card className="flex flex-wrap items-center gap-4 p-5" data-ai-locked>
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-2 text-muted">
          <Lock className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Get AI feedback on your writing</p>
          <p className="text-sm text-muted">
            Premium members can have each submitted answer checked: bands for the four criteria and sentence-level
            improvements. Your writing is saved either way.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/premium">See Premium</Link>
        </Button>
      </Card>
    );
  }

  const out = quota != null && quota.left === 0;
  return (
    <Card className="space-y-4 p-5" data-ai-check>
      <div className="flex flex-wrap items-start gap-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Sparkles className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Check my writing with AI</p>
          <p className="text-sm text-muted">
            Your {kind === "full" ? "answers are" : "answer is"} sent to Axiom, our AI partner, and checked against the four
            IELTS criteria.{" "}
            {quota
              ? kind === "full"
                ? "A full test uses 1 of your checks."
                : "This uses 1 of your checks."
              : "Admin: not counted."}{" "}
            If the check fails, nothing is used.
          </p>
        </div>
        {quota && <UsageMeter quota={quota} />}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={run} disabled={busy || out} className="h-11" aria-busy={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
          {busy ? "Checking…" : "Check my writing"}
        </Button>
        <span aria-live="polite" className="text-sm text-muted">
          {busy
            ? kind === "full"
              ? "This takes up to 30 seconds. Please keep this page open."
              : "This takes about 15 seconds. Please keep this page open."
            : out
              ? `You've used all ${quota?.limit} checks this month. They renew on ${quota?.renews}.`
              : initial?.pending
                ? "A check for this attempt is already running — refresh in a few seconds."
                : ""}
        </span>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </Card>
  );
}
