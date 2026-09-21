"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Plus, X } from "lucide-react";
import { createTask2PracticeAction } from "@/app/actions/writing-practice";
import { parseTask2 } from "@/lib/ielts/writing-prompt";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TOPICS } from "@/lib/writing-practice-topics";

/**
 * The owner's "Add Task 2" form: the wording as the paper prints it, plus the
 * topic. It saves UNPUBLISHED; the Publish button on the list below puts it
 * live — the same two steps as "Add Task 1".
 *
 * The corpus import (scripts/import-writing-practice.mjs) stays the bulk path;
 * this is for a question the owner has in hand. Both write the SAME
 * `source_hash`, so a question typed here and later reported in the corpus is
 * one row, not two — see createTask2Question().
 *
 * The preview below is the app's own parseTask2(), so the split the owner sees
 * here is exactly the split the student's page will make. Its warning does not
 * block saving (the mock's WritingEditor treats them the same way) — an odd but
 * deliberate wording is the owner's call.
 *
 * router.refresh(), never window.location.reload() — the admin-page rule.
 */
export function Task2AddForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [topic, setTopic] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const parsed = parseTask2(prompt);

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Add Task 2
      </Button>
    );
  }

  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">Add a Task 2 question</h2>
        <button
          type="button"
          aria-label="Close"
          onClick={() => setOpen(false)}
          className="rounded-lg p-1 text-muted hover:bg-surface-2"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <label className="block space-y-1 text-sm">
        <span className="font-medium">Question</span>
        <textarea
          value={prompt}
          onChange={(e) => {
            setPrompt(e.target.value);
            setSaved(false);
          }}
          rows={5}
          data-testid="task2-prompt"
          placeholder={"Some people believe that …\n\nTo what extent do you agree or disagree?"}
          className="w-full rounded-lg border border-border bg-surface p-2 text-sm"
        />
        <span className="text-xs text-muted">
          Only the topic and what the candidate must do. &ldquo;You should spend about 40 minutes…&rdquo;, &ldquo;Give
          reasons for your answer…&rdquo; and &ldquo;Write at least 250 words&rdquo; are added automatically. A blank
          line splits the statement from the question; without one, the last sentence is taken as the question.
        </span>
      </label>

      {prompt.trim() && (
        <div className="space-y-1 rounded-lg border border-border bg-surface-2 p-3 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">As the student will see it</p>
          <p>{parsed.statement || <span className="text-muted">—</span>}</p>
          <p className="font-medium">{parsed.question || <span className="text-muted">—</span>}</p>
          {parsed.warnings.length > 0 && (
            <span className="flex items-start gap-1.5 text-xs text-warning">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {parsed.warnings[0]}
            </span>
          )}
        </div>
      )}

      <label className="block space-y-1 text-sm">
        <span className="font-medium">Topic</span>
        <select
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          className="w-full rounded-lg border border-border bg-surface p-2 text-sm"
        >
          <option value="">Choose…</option>
          {TOPICS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </label>

      {error && <p className="text-sm text-danger">{error}</p>}
      {saved && <p className="text-sm text-success">Saved. Press Publish on it below to put it live.</p>}

      <div className="flex justify-end">
        <Button
          disabled={pending || !prompt.trim() || !topic}
          onClick={() =>
            startTransition(async () => {
              const fd = new FormData();
              fd.set("prompt", prompt);
              fd.set("topic", topic);
              const res = await createTask2PracticeAction(fd);
              if (!res.ok) {
                setError(res.error);
                return;
              }
              setError(null);
              setSaved(true);
              setPrompt("");
              setTopic("");
              router.refresh();
            })
          }
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" />} Save (unpublished)
        </Button>
      </div>
    </Card>
  );
}
