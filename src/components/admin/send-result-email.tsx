"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Loader2, Mail } from "lucide-react";
import { sendMockResultEmailAction } from "@/app/actions/mock";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The result email's record, and Send again (0055).
 *
 * It keeps its own message state and a plain busy flag rather than leaning on a
 * transition or router.refresh() — the same trap MockGradeForm hit: a
 * revalidating action re-keys this area and the confirmation would vanish.
 */
export type MessageRow = { id: string; kind: string; to: string; status: string; error: string | null; at: string };

export function SendResultEmail({
  attemptId,
  sentAt,
  to,
  error,
  released,
  history,
}: {
  attemptId: string;
  /** Already formatted for the reader. */
  sentAt: string | null;
  to: string | null;
  error: string | null;
  released: boolean;
  /** Every email sent for this attempt (0056), newest first. */
  history: MessageRow[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const working = pending || busy;

  function send() {
    setBusy(true);
    setMsg(null);
    start(async () => {
      try {
        const res = await sendMockResultEmailAction(attemptId);
        setMsg(res.ok ? { ok: true, text: res.note ?? "Emailed." } : { ok: false, text: res.error });
        if (res.ok) router.refresh();
      } catch {
        setMsg({ ok: false, text: "Couldn't reach the server — try again." });
      } finally {
        setBusy(false);
      }
    });
  }

  return (
    <div className="space-y-2 rounded-lg border border-border bg-surface-2/50 p-3 text-sm">
      <p className="flex flex-wrap items-center gap-2">
        <Mail className="h-4 w-4 shrink-0 text-muted" />
        {sentAt ? (
          <span>
            <span className="text-muted">Result emailed:</span> {sentAt}
            {to ? <span className="text-muted"> · {to}</span> : null}
          </span>
        ) : (
          <span className="text-muted">{released ? "Not emailed yet." : "The result email goes out when you release it."}</span>
        )}
      </p>
      {error && !sentAt && (
        <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/5 px-2.5 py-2 text-xs">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
          <span>
            <b>Email not sent.</b> {error}
          </span>
        </p>
      )}
      {history.length > 0 && (
        <ul className="space-y-1 border-t border-border pt-2 text-xs">
          {history.map((m) => (
            <li key={m.id} className="flex flex-wrap items-baseline gap-2">
              <span className="tabular-nums text-muted">{m.at}</span>
              <span className="text-muted">{m.kind === "result" ? "Result" : "Receipt"}</span>
              <span
                className={cn(
                  "font-medium",
                  m.status === "delivered"
                    ? "text-success"
                    : m.status === "sent" || m.status === "queued" || m.status === "delayed"
                      ? "text-primary"
                      : "text-danger",
                )}
              >
                {m.status}
              </span>
              <span className="break-all text-muted">{m.to}</span>
              {m.error && <span className="text-danger">{m.error}</span>}
            </li>
          ))}
        </ul>
      )}

      {released && (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" className="h-9" onClick={send} disabled={working}>
            {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            {sentAt ? "Send again" : "Send result email"}
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
