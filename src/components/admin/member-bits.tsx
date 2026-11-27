"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Plus } from "lucide-react";
import { setPremium } from "@/app/actions/admin";

/** +1 month Premium straight from a table row; the page re-renders with the new date. */
export function QuickPremium({ email }: { email: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!email) return null;
  return (
    <button
      type="button"
      disabled={busy || pending}
      title={err ?? "Add 1 month of Premium"}
      onClick={async () => {
        setBusy(true);
        setErr(null);
        const res = await setPremium(email, 1);
        setBusy(false);
        if (!res.ok) setErr(res.error);
        else start(() => router.refresh());
      }}
      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium hover:border-premium/50 hover:text-premium disabled:opacity-50"
    >
      {busy || pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
      1 mo
      {err && <span className="sr-only">Failed: {err}</span>}
    </button>
  );
}
