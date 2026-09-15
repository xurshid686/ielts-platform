"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, Loader2, Save } from "lucide-react";
import { gradeMockWriting, releaseMockAttempt, unreleaseMockAttempt } from "@/app/actions/mock";
import { Button } from "@/components/ui/button";
import { overallBand, writingBand } from "@/lib/mock-shared";
import { cn } from "@/lib/utils";

const BANDS = Array.from({ length: 19 }, (_, i) => i / 2).reverse();
/** Mirrors MAX_FEEDBACK in lib/mock-admin.ts (server-only, so not importable here). */
const MAX_FEEDBACK = 5000;

type Saved = { task1: number | null; task2: number | null; writing: number | null; feedback: string | null };

/**
 * Grade + release for one attempt.
 *
 * Release acts on what is SAVED, never on what is on screen — so it is
 * disabled while the form has unsaved changes, and its confirmation spells out
 * the saved bands. Before this, editing a saved grade left Release enabled and
 * it quietly published the old numbers.
 */
export function MockGradeForm({
  attemptId,
  status,
  listeningBand,
  readingBand,
  initial,
  nextHref,
}: {
  attemptId: string;
  status: string;
  listeningBand: number | null;
  readingBand: number | null;
  initial: Saved;
  /** The next attempt in this mock's grading queue, preserving the return filters. */
  nextHref: string | null;
}) {
  const router = useRouter();
  const toField = (b: number | null) => (b == null ? "" : String(b));
  const autoWriting = writingBand(initial.task1, initial.task2);
  const initialOverride = initial.writing != null && initial.writing !== autoWriting ? String(initial.writing) : "";

  const [task1, setTask1] = useState(toField(initial.task1));
  const [task2, setTask2] = useState(toField(initial.task2));
  const [override, setOverride] = useState(initialOverride);
  const [feedback, setFeedback] = useState(initial.feedback ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const t1 = task1 === "" ? null : Number(task1);
  const t2 = task2 === "" ? null : Number(task2);
  const suggested = writingBand(t1, t2);
  const writing = override === "" ? suggested : Number(override);
  const overall = overallBand({ listening: listeningBand, reading: readingBand, writing });
  const released = status === "released";
  const graded = initial.writing != null;
  const dirty =
    task1 !== toField(initial.task1) ||
    task2 !== toField(initial.task2) ||
    override !== initialOverride ||
    feedback !== (initial.feedback ?? "");

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function act(
    fn: () => Promise<{ ok: true } | { ok: false; error: string }>,
    okText: string,
    after?: () => void,
  ) {
    setMsg(null);
    startTransition(async () => {
      try {
        const res = await fn();
        setMsg(res.ok ? { ok: true, text: okText } : { ok: false, text: res.error });
        if (res.ok) {
          if (after) after();
          else router.refresh();
        }
      } catch {
        setMsg({ ok: false, text: "Couldn't reach the server. Your grade is still on screen — try again." });
      }
    });
  }

  function saveGrade(thenNext: boolean) {
    if (released && !confirm("This result is already visible to the student. Update the published result?")) return;
    act(
      () => gradeMockWriting(attemptId, { task1: t1!, task2: t2!, writing: override === "" ? null : Number(override), feedback }),
      released ? "Published result updated — the student sees the change now." : "Grade saved. Not visible to the student until you release.",
      thenNext && nextHref ? () => router.push(nextHref) : undefined,
    );
  }

  const select = (label: string, value: string, onChange: (v: string) => void, placeholder: string) => (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="admin-input h-11">
      <option value="">{placeholder}</option>
      {BANDS.map((b) => (
        <option key={b} value={b}>
          {b.toFixed(1)}
        </option>
      ))}
    </select>
  );

  const fmt = (b: number | null) => (b == null ? "—" : b.toFixed(1));
  const canSave = !pending && t1 != null && t2 != null && feedback.length <= MAX_FEEDBACK && (dirty || !graded);

  return (
    <div className="space-y-4">
      {released && (
        <p className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-sm">
          <b>Released.</b> The student can see this result. Saving changes updates what they see immediately.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1.5">
          <span className="text-sm font-medium">Task 1 band</span>
          {select("Task 1 band", task1, setTask1, "—")}
        </label>
        <label className="space-y-1.5">
          <span className="text-sm font-medium">Task 2 band</span>
          {select("Task 2 band", task2, setTask2, "—")}
        </label>
        <label className="space-y-1.5">
          <span className="text-sm font-medium">Writing band</span>
          {select("Writing band override", override, setOverride, suggested == null ? "—" : `Auto: ${suggested.toFixed(1)}`)}
        </label>
      </div>
      <p className="text-xs text-muted">
        Writing = (Task 1 + 2 × Task 2) ÷ 3, rounded to the nearest half band — pick a value to override. Overall = mean of
        L {fmt(listeningBand)}, R {fmt(readingBand)}, W {fmt(writing)}
        {overall != null && (
          <>
            {" "}→ <span className="font-semibold text-foreground">Overall {overall.toFixed(1)}</span>
          </>
        )}
        .
      </p>

      <label className="block space-y-1.5">
        <span className="flex items-center justify-between text-sm font-medium">
          Feedback for the student
          <span className={cn("text-xs font-normal tabular-nums", feedback.length > MAX_FEEDBACK ? "text-danger" : "text-muted")}>
            {feedback.length}/{MAX_FEEDBACK}
          </span>
        </span>
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          rows={7}
          className="admin-input min-h-36 py-2"
          placeholder="Task achievement, coherence, vocabulary, grammar — what to work on next."
        />
      </label>

      {/* Sticky action bar: long essays push the buttons off-screen, especially on a phone. */}
      <div className="sticky bottom-0 z-10 -mx-5 space-y-2 border-t border-border bg-surface/95 px-5 py-3 backdrop-blur">
        {msg && <p className={cn("text-sm", msg.ok ? "text-success" : "text-danger")}>{msg.text}</p>}
        {dirty && graded && !released && (
          <p className="text-xs text-warning">Unsaved changes — save before releasing.</p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" className="h-11" disabled={!canSave} onClick={() => saveGrade(false)}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {released ? "Update result" : "Save grade"}
          </Button>
          {!released && nextHref && (
            <Button className="h-11" disabled={!canSave} onClick={() => saveGrade(true)}>
              Save &amp; next <ArrowRight className="h-4 w-4" />
            </Button>
          )}
          {released ? (
            <Button
              variant="outline"
              className="h-11"
              disabled={pending || dirty}
              onClick={() => {
                if (!confirm("Hide this result from the student again?")) return;
                act(() => unreleaseMockAttempt(attemptId), "Result hidden from the student.");
              }}
            >
              <EyeOff className="h-4 w-4" /> Unrelease
            </Button>
          ) : (
            <Button
              variant={nextHref ? "outline" : "primary"}
              className="h-11"
              disabled={pending || status !== "submitted" || !graded || dirty}
              title={!graded ? "Save a grade first" : dirty ? "Save your changes first" : undefined}
              onClick={() => {
                if (
                  !confirm(
                    `Release to the student?\n\nListening ${fmt(listeningBand)} · Reading ${fmt(readingBand)} · Writing ${fmt(initial.writing)}\n\nThey will be notified and see these bands now.`,
                  )
                )
                  return;
                act(() => releaseMockAttempt(attemptId), "Released — the student has been notified.");
              }}
            >
              <Eye className="h-4 w-4" /> Release result
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
