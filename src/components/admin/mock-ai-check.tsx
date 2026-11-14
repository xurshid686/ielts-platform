"use client";

import { useState } from "react";
import { Loader2, Send, Sparkles, Wand2 } from "lucide-react";
import { resendCheckPdf, runMockAiCheck, setMockAiVisible } from "@/app/actions/writing-ai";
import { AiFeedbackCard } from "@/components/writing/ai-feedback-card";
import { Button } from "@/components/ui/button";
import { draftBands, draftFeedbackText, type AiTaskResult } from "@/lib/writing-ai-shared";
import { cn } from "@/lib/utils";

/** The slice of a check row the card needs (a plain object, so it crosses to the client). */
export type AiCheckView = {
  id: string;
  status: "pending" | "done" | "failed";
  results: AiTaskResult[];
  show_to_student: boolean;
  error: string | null;
  telegram_sent_at: string | null;
  telegram_error: string | null;
  created_at: string;
};

const when = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tashkent", dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

/**
 * The owner's AI draft for one mock attempt. NOTHING here runs on its own: the
 * owner presses Run. The draft is private — the student sees none of it unless
 * the attempt is released AND the switch below is on, and even then only
 * Axiom's comments, never its numbers. "Apply to my grade" only FILLS the form;
 * every band stays the owner's to change, before or after release.
 */
export function MockAiCheck({
  attemptId,
  initial,
  isOwner,
  onApply,
}: {
  attemptId: string;
  initial: AiCheckView[];
  isOwner: boolean;
  onApply: (draft: { task1: number | null; task2: number | null; feedback: string }) => void;
}) {
  const [checks, setChecks] = useState<AiCheckView[]>(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const latest = checks.find((c) => c.status === "done") ?? null;
  const lastFailed = !latest ? checks.find((c) => c.status === "failed") : null;

  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await runMockAiCheck(attemptId);
      if (res.ok) {
        setChecks((cs) => [{ ...res.check }, ...cs]);
        setMsg({ ok: true, text: "Axiom's draft is ready below. The student can't see it." });
      } else {
        setMsg({ ok: false, text: res.error });
      }
    } catch {
      setMsg({ ok: false, text: "Couldn't reach the server — try again." });
    } finally {
      setBusy(false);
    }
  }

  async function toggle(visible: boolean) {
    if (!latest) return;
    setChecks((cs) => cs.map((c) => (c.id === latest.id ? { ...c, show_to_student: visible } : c)));
    const res = await setMockAiVisible(latest.id, visible);
    if (!res.ok) {
      setChecks((cs) => cs.map((c) => (c.id === latest.id ? { ...c, show_to_student: !visible } : c)));
      setMsg({ ok: false, text: res.error });
    }
  }

  async function resend() {
    if (!latest) return;
    setMsg(null);
    const res = await resendCheckPdf(latest.id);
    if (res.ok) {
      setChecks((cs) => cs.map((c) => (c.id === latest.id ? { ...c, telegram_sent_at: new Date().toISOString(), telegram_error: null } : c)));
      setMsg({ ok: true, text: "Sent again." });
    } else {
      setMsg({ ok: false, text: res.error });
    }
  }

  const draft = latest ? draftBands(latest.results) : null;

  return (
    <div className="space-y-4 rounded-xl border border-border bg-surface-2/40 p-4" data-ai-card>
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Sparkles className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">AI draft (Axiom)</p>
          <p className="text-xs text-muted">
            Private to you. Runs only when you press the button; the student sees nothing until you release and switch it on.
          </p>
        </div>
        <Button variant={latest ? "outline" : "primary"} className="h-10" disabled={busy} onClick={run} aria-busy={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {busy ? "Checking… up to 30 s" : latest ? "Run again" : "Run AI check"}
        </Button>
      </div>

      {msg && (
        <p role="status" className={cn("text-sm", msg.ok ? "text-success" : "text-danger")}>
          {msg.text}
        </p>
      )}
      {lastFailed && <p className="text-xs text-muted">The last attempt failed ({lastFailed.error ?? "unknown error"}). It was not counted.</p>}

      {latest && (
        <>
          <p className="text-xs text-muted">Checked {when(latest.created_at)}</p>
          <AiFeedbackCard results={latest.results} showBands heading="Axiom's draft" note="Raw Axiom scores. Your own bands below are what the student receives." />

          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              className="h-10"
              onClick={() => onApply({ task1: draft?.task1 ?? null, task2: draft?.task2 ?? null, feedback: draftFeedbackText(latest.results) })}
            >
              <Wand2 className="h-4 w-4" /> Apply to my grade
            </Button>
            <span className="text-xs text-muted">
              Fills Task 1 {draft?.task1?.toFixed(1) ?? "—"} · Task 2 {draft?.task2?.toFixed(1) ?? "—"} and the feedback box. Change anything, then save.
            </span>
          </div>

          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={latest.show_to_student}
              onChange={(e) => void toggle(e.target.checked)}
            />
            <span>
              Show Axiom&apos;s comments to the student after release
              <span className="block text-xs text-muted">Words only — they never see Axiom&apos;s band numbers, only yours.</span>
            </span>
          </label>

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            {latest.telegram_sent_at ? (
              <span>PDF sent to the writing group · {when(latest.telegram_sent_at)}</span>
            ) : latest.telegram_error ? (
              <span className="text-warning">PDF not sent: {latest.telegram_error}</span>
            ) : (
              <span>PDF to the writing group: not recorded as sent (it posts a few seconds after a check).</span>
            )}
            {isOwner && !latest.telegram_sent_at && (
              <Button variant="ghost" size="sm" onClick={resend}>
                <Send className="h-3.5 w-3.5" /> Send again
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
