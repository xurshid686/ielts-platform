"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Loader2, Mail, RefreshCw } from "lucide-react";
import { retryFailedResultEmailsAction } from "@/app/actions/mock";
import type { MockMessage } from "@/lib/mock-admin";
import { tashkent, type EmailBucket, type EmailStatusCounts } from "@/lib/mock-shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The email status bar (0056): did every released student get their result?
 *
 * The counts are per ATTEMPT (one state each, from its latest message) so they
 * add up to the released total; the log below lists the messages themselves,
 * where a retry is a second row rather than an overwrite. "Sent" means Resend
 * accepted it; "Delivered" means the student's mail server took it — that
 * distinction only exists once the webhook is configured.
 */

const CHIPS: { key: EmailBucket; label: string; tone: string; title: string }[] = [
  { key: "delivered", label: "delivered", tone: "bg-success/10 text-success", title: "Accepted by the student's mail server" },
  { key: "sent", label: "sent", tone: "bg-primary/10 text-primary", title: "Resend accepted it; no delivery confirmation yet" },
  { key: "delayed", label: "delayed", tone: "bg-warning/10 text-warning", title: "The receiving server asked Resend to retry" },
  { key: "bounced", label: "bounced", tone: "bg-danger/10 text-danger", title: "Rejected — the address is probably wrong" },
  { key: "complained", label: "marked as spam", tone: "bg-danger/10 text-danger", title: "The student marked it as spam" },
  { key: "failed", label: "failed", tone: "bg-danger/10 text-danger", title: "Resend refused it — see the log" },
  { key: "not_sent", label: "not emailed", tone: "bg-surface-2 text-muted", title: "Released, but no email has gone out" },
  { key: "no_address", label: "no address", tone: "bg-surface-2 text-muted", title: "This attempt has no email address" },
];

const STATUS_TONE: Record<string, string> = {
  delivered: "text-success",
  sent: "text-primary",
  queued: "text-muted",
  delayed: "text-warning",
  bounced: "text-danger",
  complained: "text-danger",
  failed: "text-danger",
};

export function EmailStatus({
  counts,
  messages,
  mockId,
  mockName,
  active,
  onFilter,
}: {
  counts: EmailStatusCounts;
  messages: MockMessage[];
  /** The mock in scope, or null for all mocks — retry needs one mock. */
  mockId: string | null;
  mockName: string | null;
  /** The `email=` filter currently applied to the Results table. */
  active: string;
  onFilter: (bucket: string | null) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const working = pending || busy;

  function retry() {
    if (!mockId) return;
    setBusy(true);
    setMsg(null);
    start(async () => {
      try {
        const res = await retryFailedResultEmailsAction(mockId);
        setMsg(res.ok ? { ok: true, text: res.note ?? "Sent." } : { ok: false, text: res.error });
        router.refresh();
      } catch {
        setMsg({ ok: false, text: "Couldn't reach the server — try again." });
      } finally {
        setBusy(false);
      }
    });
  }

  const shown = CHIPS.filter((c) => counts[c.key] > 0);

  return (
    <div className="mb-3 space-y-2 rounded-xl border border-border bg-surface p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Mail className="h-4 w-4 text-muted" />
          Result emails
          <span className="font-normal text-muted">
            {counts.released} released{mockName ? ` · ${mockName}` : ""}
          </span>
        </p>

        <div className="flex flex-wrap items-center gap-1.5">
          {shown.length === 0 && <span className="text-xs text-muted">Nothing released yet.</span>}
          {shown.map((c) => (
            <button
              key={c.key}
              title={`${c.title} — click to filter`}
              onClick={() => onFilter(active === c.key ? null : c.key)}
              className={cn(
                "rounded px-2 py-0.5 text-xs font-medium",
                c.tone,
                active === c.key && "ring-2 ring-primary/40",
              )}
            >
              {counts[c.key]} {c.label}
            </button>
          ))}
          {active && (
            <button onClick={() => onFilter(null)} className="rounded px-2 py-0.5 text-xs text-muted hover:bg-surface-2">
              clear filter
            </button>
          )}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {counts.failed > 0 && mockId && (
            <Button size="sm" variant="outline" className="h-9" onClick={retry} disabled={working}>
              {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Retry failed ({counts.failed})
            </Button>
          )}
          {counts.failed > 0 && !mockId && (
            <span className="text-xs text-muted">Pick a mock above to retry its failures.</span>
          )}
          <Button size="sm" variant="outline" className="h-9" onClick={() => setOpen((o) => !o)}>
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />} Email history
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted">
        Receipts: {counts.receipts_sent} sent{counts.receipts_failed ? ` · ${counts.receipts_failed} failed` : ""}.
        {counts.bounced + counts.complained > 0 && (
          <span className="text-danger">
            {" "}
            A bounced address is not retried — fix the student&apos;s email first.
          </span>
        )}
      </p>

      {msg && (
        <p className={cn("flex items-center gap-1.5 text-xs", msg.ok ? "text-success" : "text-danger")}>
          {msg.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
          {msg.text}
        </p>
      )}

      {open && (
        <div className="overflow-x-auto rounded-lg border border-border">
          {messages.length === 0 ? (
            <p className="p-3 text-sm text-muted">No emails yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-left text-xs text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Time</th>
                  <th className="px-3 py-2 font-medium">Student</th>
                  {!mockId && <th className="px-3 py-2 font-medium">Mock</th>}
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">To</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {messages.map((m) => (
                  <tr key={m.id} className="border-t border-border align-top">
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-muted">{tashkent(m.created_at)}</td>
                    <td className="px-3 py-2">{m.student_name ?? "—"}</td>
                    {!mockId && <td className="px-3 py-2 text-muted">{m.mock_title}</td>}
                    <td className="px-3 py-2 text-muted">{m.kind === "result" ? "Result" : "Receipt"}</td>
                    <td className="break-all px-3 py-2 text-muted">{m.to_email}</td>
                    <td className={cn("px-3 py-2 font-medium", STATUS_TONE[m.status] ?? "text-muted")}>
                      {m.status}
                      {m.error && <span className="block text-xs font-normal text-danger">{m.error}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
