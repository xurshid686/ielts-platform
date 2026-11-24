"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Bug, CheckCircle2, X } from "lucide-react";
import { reportTestProblem } from "@/app/actions/test-reports";
import { categoriesFor, cleanReport, REPORT_FIXED_XP, REPORT_MESSAGE_MAX } from "@/lib/test-reports-shared";

/**
 * "Report a problem" (0072) — opened from the practice player's top bar, so it
 * sits OUTSIDE the CDI iframe and works for every paper. Guests are asked to
 * sign in (owner, 2026-11-24): a report needs someone to thank and reward.
 */
export function TestReportDialog({
  testId,
  skill,
  guest,
  onClose,
}: {
  testId: string;
  skill: string;
  guest: boolean;
  onClose: () => void;
}) {
  const [category, setCategory] = useState<string>("");
  const [question, setQuestion] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();

  function send() {
    const clean = cleanReport({ category, question, message });
    if (!clean.ok) return setError(clean.error);
    setError(null);
    start(async () => {
      const res = await reportTestProblem(testId, {
        category,
        question,
        message,
        pageUrl: window.location.href,
      });
      if (!res.ok) return setError(res.error);
      setSent(true);
    });
  }

  const shell = (children: React.ReactNode) => (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-title"
        className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-surface p-6 shadow-elevated"
      >
        <button
          onClick={() => !pending && onClose()}
          className="absolute right-3 top-3 text-muted hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
        {children}
      </div>
    </div>
  );

  if (guest) {
    return shell(
      <div className="text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Bug className="h-6 w-6" />
        </div>
        <h3 id="report-title" className="mt-3 font-semibold">
          Found a problem?
        </h3>
        <p className="mt-2 text-sm text-muted">
          Sign in to report it. If it&apos;s a real mistake, we fix it and you get {REPORT_FIXED_XP} XP.
        </p>
        <Link
          href={`/login?next=${encodeURIComponent(typeof window === "undefined" ? "/" : window.location.pathname)}`}
          className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Sign in to report
        </Link>
      </div>,
    );
  }

  if (sent) {
    return shell(
      <div className="text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/10 text-success">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <h3 id="report-title" className="mt-3 font-semibold">
          Thanks! We&apos;ll check it.
        </h3>
        <p className="mt-2 text-sm text-muted">
          If it&apos;s a real mistake, we&apos;ll fix it and you&apos;ll get {REPORT_FIXED_XP} XP.
        </p>
        <button
          onClick={onClose}
          className="mt-5 w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Back to the test
        </button>
      </div>,
    );
  }

  return shell(
    <>
      <h3 id="report-title" className="flex items-center gap-2 font-semibold">
        <Bug className="h-5 w-5 text-primary" /> Report a problem
      </h3>
      <p className="mt-1 text-sm text-muted">Tell us what&apos;s wrong in this test. We read every report.</p>

      <p className="mt-4 text-sm font-medium">What&apos;s wrong?</p>
      <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Kind of problem">
        {categoriesFor(skill).map((c) => (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={category === c.id}
            onClick={() => setCategory(c.id)}
            disabled={pending}
            className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
              category === c.id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border hover:bg-surface-2"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <label htmlFor="report-q" className="mt-4 block text-sm font-medium">
        Question number <span className="font-normal text-muted">(optional)</span>
      </label>
      <input
        id="report-q"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="e.g. 14 or 14-17"
        inputMode="numeric"
        maxLength={20}
        disabled={pending}
        className="mt-1.5 w-40 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
      />

      <label htmlFor="report-msg" className="mt-4 block text-sm font-medium">
        Describe the problem
      </label>
      <textarea
        id="report-msg"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={4}
        maxLength={REPORT_MESSAGE_MAX}
        placeholder="e.g. The answer key says B, but paragraph C says the opposite."
        disabled={pending}
        className="mt-1.5 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
      />

      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-5 flex gap-2">
        <button
          onClick={onClose}
          disabled={pending}
          className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-2 disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          onClick={send}
          disabled={pending}
          className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Sending…" : "Send report"}
        </button>
      </div>
    </>,
  );
}
