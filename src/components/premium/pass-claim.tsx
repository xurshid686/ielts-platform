"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Gift, Loader2 } from "lucide-react";
import { claimPassAction } from "@/app/actions/premium";

/**
 * The lock screen's "open free" button: spends one of this week's free
 * Premium passes on this test. The test then stays open for this account.
 */
export function PassClaim({ testId, left, perWeek }: { testId: string; left: number; perWeek: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (left <= 0) {
    return (
      <div className="mt-4 rounded-xl border border-border bg-surface p-4 text-left text-sm">
        <p className="font-medium">You&apos;ve used this week&apos;s {perWeek} free Premium tests.</p>
        <p className="mt-1 text-muted">They come back on Monday. Or open everything now with Premium:</p>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-4 text-left text-sm">
      <p className="font-medium">
        Every account gets {perWeek} Premium tests free each week.
      </p>
      <p className="mt-1 text-muted">
        You have <strong className="text-foreground">{left} of {perWeek}</strong> left this week. A test you
        open stays yours.
      </p>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          start(async () => {
            const res = await claimPassAction(testId);
            if (res.ok) router.refresh();
            else setError(res.error);
          });
        }}
        className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground hover:brightness-95 disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gift className="h-4 w-4" />}
        Open this test free
      </button>
      {error && <p className="mt-2 text-danger">{error}</p>}
    </div>
  );
}
