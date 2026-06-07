"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Zap, Loader2 } from "lucide-react";
import { unlockTest } from "@/app/actions/unlock";

// Spend XP to unlock a premium test from its locked detail screen. On success
// the page refreshes and the server re-renders the actual test.
export function UnlockButton({
  testId,
  cost,
  xp,
}: {
  testId: string;
  cost: number;
  xp: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const affordable = xp >= cost;

  async function go() {
    setBusy(true);
    setError(null);
    const res = await unlockTest(testId);
    if (!res.ok) {
      setError(res.error);
      setBusy(false);
      return;
    }
    router.refresh();
  }

  return (
    <div className="mt-6 space-y-2">
      <button
        onClick={go}
        disabled={busy || !affordable}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-amber-400 to-yellow-500 px-5 py-2.5 font-semibold text-white shadow-sm transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
        Unlock for {cost} XP
      </button>
      <p className="flex items-center justify-center gap-1 text-xs text-muted">
        <Zap className="h-3.5 w-3.5" /> You have {xp} XP
        {!affordable && ` — ${cost - xp} more needed`}
      </p>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
