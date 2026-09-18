"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, Plus, X } from "lucide-react";
import { createTask1PracticeAction } from "@/app/actions/writing-practice";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CHARTS } from "@/lib/writing-practice-topics";

/**
 * The owner's "Add Task 1" form: the picture (drop, click or Ctrl+V — the mock
 * form's picture UX), the topic sentence exactly as the paper prints it, and
 * what kind of picture it is. It saves UNPUBLISHED; the Publish button on the
 * list below puts it live.
 *
 * The owner types only the sentence ("The pie charts show…"). "Summarise the
 * information…" and "Write at least 150 words." are added at display time by
 * lib/ielts/writing-prompt.ts, the same as in the mock.
 *
 * router.refresh(), never window.location.reload() — the admin-page rule.
 */
export function Task1UploadForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [chart, setChart] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  // The preview is a blob URL: made when a picture is picked, released when it
  // is replaced, cleared or the form goes away.
  const previewRef = useRef<string | null>(null);
  function showPreview(f: File | null) {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = f ? URL.createObjectURL(f) : null;
    setPreview(previewRef.current);
  }
  useEffect(() => () => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
  }, []);

  const pickRef = useRef<(f: File | null | undefined) => void>(() => {});
  function pick(f: File | null | undefined) {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError("The picture must be an image file.");
      return;
    }
    setError(null);
    setSaved(false);
    setFile(f);
    showPreview(f);
  }
  useEffect(() => {
    pickRef.current = pick;
  });

  // Ctrl+V anywhere while the form is open.
  useEffect(() => {
    if (!open) return;
    function onPaste(e: ClipboardEvent) {
      const item = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
      if (item) {
        e.preventDefault();
        pickRef.current(item);
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [open]);

  function reset() {
    setFile(null);
    showPreview(null);
    setPrompt("");
    setChart("");
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Add Task 1
      </Button>
    );
  }

  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">Add a Task 1 question</h2>
        <button
          type="button"
          aria-label="Close"
          onClick={() => setOpen(false)}
          className="rounded-lg p-1 text-muted hover:bg-surface-2"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div
        role="button"
        tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          pick(e.dataTransfer.files?.[0]);
        }}
        className="flex min-h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border p-4 text-sm text-muted hover:bg-surface-2"
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- local blob preview
          <img src={preview} alt="Task 1 picture preview" className="max-h-72 max-w-full rounded bg-white object-contain" />
        ) : (
          <>
            <ImagePlus className="h-6 w-6" />
            Drop the picture here, click to choose, or paste it (Ctrl+V)
          </>
        )}
        <input
          ref={input}
          type="file"
          accept="image/*"
          hidden
          data-testid="task1-image"
          onChange={(e) => pick(e.target.files?.[0])}
        />
      </div>

      <label className="block space-y-1 text-sm">
        <span className="font-medium">Sentence</span>
        <textarea
          value={prompt}
          onChange={(e) => {
            setPrompt(e.target.value);
            setSaved(false);
          }}
          rows={3}
          placeholder="The pie charts show …"
          className="w-full rounded-lg border border-border bg-surface p-2 text-sm"
        />
        <span className="text-xs text-muted">
          Only the sentence from the paper. &ldquo;Summarise the information…&rdquo; and &ldquo;Write at least 150
          words&rdquo; are added automatically.
        </span>
      </label>

      <label className="block space-y-1 text-sm">
        <span className="font-medium">Kind of picture</span>
        <select
          value={chart}
          onChange={(e) => setChart(e.target.value)}
          className="w-full rounded-lg border border-border bg-surface p-2 text-sm"
        >
          <option value="">Choose…</option>
          {CHARTS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </label>

      {error && <p className="text-sm text-danger">{error}</p>}
      {saved && <p className="text-sm text-success">Saved. Press Publish on it below to put it live.</p>}

      <div className="flex justify-end">
        <Button
          disabled={pending || !file || !prompt.trim() || !chart}
          onClick={() =>
            startTransition(async () => {
              const fd = new FormData();
              if (file) fd.set("image", file);
              fd.set("prompt", prompt);
              fd.set("chart", chart);
              const res = await createTask1PracticeAction(fd);
              if (!res.ok) {
                setError(res.error);
                return;
              }
              setError(null);
              setSaved(true);
              reset();
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
