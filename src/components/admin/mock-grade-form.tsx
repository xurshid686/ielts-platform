"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, Save } from "lucide-react";
import { gradeMockWriting, releaseMockAttempt, unreleaseMockAttempt } from "@/app/actions/mock";
import { Button } from "@/components/ui/button";
import { overallBand, writingBand } from "@/lib/mock-shared";
import { cn } from "@/lib/utils";

const BANDS = Array.from({ length: 19 }, (_, i) => i / 2).reverse();

export function MockGradeForm({
  attemptId,
  status,
  listeningBand,
  readingBand,
  initial,
}: {
  attemptId: string;
  status: string;
  listeningBand: number | null;
  readingBand: number | null;
  initial: { task1: number | null; task2: number | null; writing: number | null; feedback: string | null };
}) {
  const router = useRouter();
  const [task1, setTask1] = useState(initial.task1 == null ? "" : String(initial.task1));
  const [task2, setTask2] = useState(initial.task2 == null ? "" : String(initial.task2));
  const [override, setOverride] = useState(
    initial.writing != null && initial.writing !== writingBand(initial.task1, initial.task2)
      ? String(initial.writing)
      : "",
  );
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

  function act(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, okText: string) {
    setMsg(null);
    startTransition(async () => {
      const res = await fn();
      setMsg(res.ok ? { ok: true, text: okText } : { ok: false, text: res.error });
      if (res.ok) router.refresh();
    });
  }

  const select = (value: string, onChange: (v: string) => void, placeholder: string) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="admin-input h-10">
      <option value="">{placeholder}</option>
      {BANDS.map((b) => (
        <option key={b} value={b}>
          {b.toFixed(1)}
        </option>
      ))}
    </select>
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1.5">
          <span className="text-sm font-medium">Task 1 band</span>
          {select(task1, setTask1, "—")}
        </label>
        <label className="space-y-1.5">
          <span className="text-sm font-medium">Task 2 band</span>
          {select(task2, setTask2, "—")}
        </label>
        <label className="space-y-1.5">
          <span className="text-sm font-medium">Writing band</span>
          {select(override, setOverride, suggested == null ? "—" : `Auto: ${suggested.toFixed(1)}`)}
        </label>
      </div>
      <p className="text-xs text-muted">
        Writing band defaults to (Task 1 + 2 × Task 2) ÷ 3, rounded to the nearest half band. Pick a
        value to override it. Overall = mean of L, R, W with IELTS rounding
        {overall != null && (
          <>
            {" "}— <span className="font-semibold text-foreground">Overall {overall.toFixed(1)}</span>
          </>
        )}
        .
      </p>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Feedback for the student</span>
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          rows={6}
          className="admin-input min-h-32 py-2"
          placeholder="Task achievement, coherence, vocabulary, grammar — what to work on next."
        />
      </label>

      {msg && (
        <p className={cn("text-sm", msg.ok ? "text-success" : "text-danger")}>{msg.text}</p>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="outline"
          disabled={pending || t1 == null || t2 == null}
          onClick={() =>
            act(
              () =>
                gradeMockWriting(attemptId, {
                  task1: t1!,
                  task2: t2!,
                  writing: override === "" ? null : Number(override),
                  feedback,
                }),
              released ? "Saved — the student sees the change now." : "Grade saved. Not visible to the student until you release.",
            )
          }
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save grade
        </Button>
        {released ? (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => {
              if (!confirm("Hide this result from the student again?")) return;
              act(() => unreleaseMockAttempt(attemptId), "Result hidden from the student.");
            }}
          >
            <EyeOff className="h-4 w-4" /> Unrelease
          </Button>
        ) : (
          <Button
            disabled={pending || status !== "submitted" || !graded}
            title={!graded ? "Save a grade first" : undefined}
            onClick={() => {
              if (!confirm("Release this result to the student? They will be notified.")) return;
              act(() => releaseMockAttempt(attemptId), "Released — the student has been notified.");
            }}
          >
            <Eye className="h-4 w-4" /> Release result
          </Button>
        )}
      </div>
    </div>
  );
}
