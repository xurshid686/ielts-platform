"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, FileText, LinkIcon, Trash2, Loader2 } from "lucide-react";
import { uploadMaterial, deleteMaterial } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { levelLabel } from "@/lib/levels";
import type { Material } from "@/types/database";

export function MaterialsManager({ initial }: { initial: Material[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function action(formData: FormData) {
    setLoading(true);
    setMsg(null);
    const res = await uploadMaterial(formData);
    setLoading(false);
    if (res.ok) {
      setMsg({ ok: true, text: "Material added." });
      formRef.current?.reset();
      router.refresh();
    } else {
      setMsg({ ok: false, text: res.error });
    }
  }

  async function remove(m: Material) {
    if (!confirm(`Delete “${m.title}”? This can't be undone.`)) return;
    setDeletingId(m.id);
    const res = await deleteMaterial(m.id);
    setDeletingId(null);
    if (res.ok) router.refresh();
    else setMsg({ ok: false, text: res.error });
  }

  return (
    <div className="space-y-8">
      <Card>
        <h2 className="mb-4 font-semibold">Add a material</h2>
        <form ref={formRef} action={action} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-sm font-medium">Title</span>
              <input
                name="title"
                required
                placeholder="Vocabulary Task Book — Unit 1"
                className="mat-input"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-sm font-medium">Level</span>
              <select name="level" required className="mat-input" defaultValue="pre_ielts">
                <option value="pre_ielts">Pre-IELTS</option>
                <option value="intro">Introduction</option>
              </select>
            </label>
            <label className="space-y-1.5 sm:col-span-2">
              <span className="text-sm font-medium">
                Description <span className="text-muted">(optional)</span>
              </span>
              <input
                name="description"
                placeholder="40-word vocabulary list with synonym &amp; antonym practice."
                className="mat-input"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-sm font-medium">
                File <span className="text-muted">(PDF, DOCX…)</span>
              </span>
              <input name="file" type="file" className="mat-input pt-2" />
            </label>
            <label className="space-y-1.5">
              <span className="text-sm font-medium">
                …or a link <span className="text-muted">(video, doc)</span>
              </span>
              <input name="url" type="url" placeholder="https://…" className="mat-input" />
            </label>
          </div>

          <p className="text-xs text-muted">
            Add a file <strong>or</strong> a link. Files are private — only students of the
            chosen level (and admins) can open them.
          </p>

          {msg && <p className={`text-sm ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</p>}

          <Button type="submit" disabled={loading}>
            <UploadCloud className="h-4 w-4" />
            {loading ? "Saving…" : "Add material"}
          </Button>
        </form>
      </Card>

      <section>
        <h2 className="mb-3 text-lg font-semibold">All materials ({initial.length})</h2>
        <Card className="p-0">
          {initial.length === 0 ? (
            <p className="p-6 text-center text-muted">No materials yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {initial.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                        m.kind === "file"
                          ? "bg-primary/10 text-primary"
                          : "bg-accent/15 text-accent"
                      }`}
                    >
                      {m.kind === "file" ? (
                        <FileText className="h-4 w-4" />
                      ) : (
                        <LinkIcon className="h-4 w-4" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{m.title}</p>
                      <p className="text-xs text-muted">
                        {levelLabel(m.level)} · {m.kind === "file" ? "File" : "Link"}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => remove(m)}
                    disabled={deletingId === m.id}
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-danger hover:bg-danger/10 disabled:opacity-50"
                  >
                    {deletingId === m.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      <style jsx>{`
        :global(.mat-input) {
          width: 100%;
          height: 2.5rem;
          border-radius: 0.5rem;
          border: 1px solid var(--border);
          background: var(--surface-2);
          color: var(--foreground);
          padding: 0 0.75rem;
          font-size: 0.9rem;
          outline: none;
        }
        :global(.mat-input:focus) {
          border-color: var(--ring);
        }
      `}</style>
    </div>
  );
}
