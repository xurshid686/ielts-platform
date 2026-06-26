"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, Send, Loader2, X, Check } from "lucide-react";
import { sendFeedback, listStudentFeedback } from "@/app/actions/feedback";
import { timeAgo } from "@/lib/utils";
import type { Skill, TeacherFeedback } from "@/types/database";

export function FeedbackComposer({
  studentId,
  studentName,
  assignmentId,
  skill,
  title,
  size = "md",
}: {
  studentId: string;
  studentName: string;
  assignmentId?: string;
  skill?: Skill;
  title?: string;
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<TeacherFeedback[] | null>(null);

  async function openModal() {
    setOpen(true);
    setSent(false);
    setError(null);
    setHistory(null);
    const res = await listStudentFeedback(studentId);
    if (res.ok) setHistory(res.feedback);
  }

  async function submit() {
    if (!body.trim()) return;
    setSending(true);
    setError(null);
    const res = await sendFeedback({
      studentId,
      body,
      assignmentId: assignmentId ?? null,
      skill: skill ?? null,
      title: title ?? null,
    });
    setSending(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setBody("");
    setSent(true);
    const refreshed = await listStudentFeedback(studentId);
    if (refreshed.ok) setHistory(refreshed.feedback);
    router.refresh();
  }

  return (
    <>
      <button
        onClick={openModal}
        className={
          size === "sm"
            ? "inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-medium text-muted hover:bg-surface-2 hover:text-foreground"
            : "inline-flex h-9 items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 text-sm font-medium text-primary hover:bg-primary/20"
        }
        title={`Send feedback to ${studentName}`}
      >
        <MessageSquare className="h-3.5 w-3.5" /> Feedback
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-elevated"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-border px-5 py-3">
              <div className="min-w-0">
                <h3 className="font-semibold">Feedback for {studentName}</h3>
                {title && (
                  <p className="truncate text-xs text-muted">Re: {title}</p>
                )}
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-muted hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Past feedback */}
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
              {history === null ? (
                <p className="flex items-center gap-2 text-sm text-muted">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </p>
              ) : history.length === 0 ? (
                <p className="text-sm text-muted">No feedback sent yet.</p>
              ) : (
                <ul className="space-y-3">
                  {history.map((f) => (
                    <li key={f.id} className="rounded-lg border border-border bg-surface-2/50 p-3">
                      {(f.title || f.skill) && (
                        <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted">
                          {f.title ?? f.skill}
                        </p>
                      )}
                      <p className="whitespace-pre-wrap text-sm">{f.body}</p>
                      <p className="mt-1 text-[11px] text-muted">
                        {timeAgo(f.created_at)}
                        {f.read_at ? " · read" : " · unread"}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Composer */}
            <div className="border-t border-border px-5 py-3">
              {title && (
                <span className="mb-2 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                  Re: {title}
                </span>
              )}
              <textarea
                value={body}
                onChange={(e) => {
                  setBody(e.target.value);
                  setSent(false);
                }}
                rows={3}
                placeholder={`Write feedback for ${studentName}…`}
                className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary/40"
              />
              {error && <p className="mt-1 text-xs text-danger">{error}</p>}
              <div className="mt-2 flex items-center justify-between">
                {sent ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
                    <Check className="h-3.5 w-3.5" /> Sent
                  </span>
                ) : (
                  <span />
                )}
                <button
                  onClick={submit}
                  disabled={sending || !body.trim()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-[var(--shadow-primary)] disabled:opacity-60"
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Send feedback
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
