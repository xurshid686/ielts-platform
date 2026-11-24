"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Loader2, Smartphone } from "lucide-react";
import { sendMockResultSmsAction } from "@/app/actions/mock";
import { Button } from "@/components/ui/button";

/**
 * The result SMS's record, and Send SMS again (0071). Own message state and a
 * plain busy flag, for the same re-key reason as SendResultEmail.
 */
export function SendResultSms({
  attemptId,
  sentAt,
  to,
  error,
  released,
}: {
  attemptId: string;
  /** Already formatted for the reader. */
  sentAt: string | null;
  /** Formatted +998 number, or null. */
  to: string | null;
  error: string | null;
  released: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function send() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await sendMockResultSmsAction(attemptId);
      setMsg(res.ok ? { ok: true, text: res.note ?? "Texted." } : { ok: false, text: res.error });
      if (res.ok) router.refresh();
    } catch {
      setMsg({ ok: false, text: "Couldn't reach the server — try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-border bg-surface-2/50 p-3 text-sm">
      <p className="flex flex-wrap items-center gap-2">
        <Smartphone className="h-4 w-4 shrink-0 text-muted" />
        {sentAt ? (
          <span>
            <span className="text-muted">Result texted:</span> {sentAt}
            {to ? <span className="text-muted"> · {to}</span> : null}
          </span>
        ) : (
          <span className="text-muted">
            {released ? "Not texted." : "The result SMS goes out when you release it, if the student gave a +998 number."}
          </span>
        )}
      </p>
      {error && !sentAt && (
        <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/5 px-2.5 py-2 text-xs">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
          <span>
            <b>SMS not sent.</b> {error}
          </span>
        </p>
      )}
      {released && (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" className="h-9" onClick={send} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />}
            {sentAt ? "Send SMS again" : "Send result SMS"}
          </Button>
          {msg && (
            <span className={msg.ok ? "flex items-center gap-1 text-xs text-success" : "text-xs text-danger"}>
              {msg.ok && <CheckCircle2 className="h-3.5 w-3.5" />}
              {msg.text}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
