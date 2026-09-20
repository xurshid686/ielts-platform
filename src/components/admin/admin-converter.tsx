"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  FileUp,
  Loader2,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  cancelConversion,
  deleteConversion,
  publishConversion,
  queueConversion,
} from "@/app/actions/converter";

type Json = unknown;

type Job = {
  id: string;
  test_id: string;
  title: string;
  html_path: string | null;
  status: "queued" | "running" | "passed" | "failed" | "published" | "cancelled";
  stage: string | null;
  log: string | null;
  shape: Json;
  errata: Json;
  report: Json;
  published_test_id: string | null;
  created_at: string;
};

type Shape = {
  parts?: number;
  questions?: number;
  ranges?: string;
  figures?: number;
  printedKey?: number | null;
  passages?: { part: number; title: string; paragraphs: number; groups: number }[];
};

type Report = {
  cost?: { total?: number; calls?: number };
  consensus?: Record<string, number>;
  secondDerivation?: string;
};

type Erratum = {
  q: number;
  printed: string | null;
  derivedA: string | null;
  derivedB: string | null;
  severity: string;
  note: string;
};

const LIVE: Job["status"][] = ["queued", "running"];

export function AdminConverter({ jobs, selfId }: { jobs: Job[]; selfId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // While anything is queued or running the worker is writing to these rows
  // from another machine, so the page has to ask. It refreshes rather than
  // reloads — a reload would throw away the form the owner is filling in.
  const live = jobs.some((j) => LIVE.includes(j.status));
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [live, router]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy("submit");
    setMsg(null);
    const res = await queueConversion(new FormData(form));
    setBusy(null);
    if (!res.ok) {
      setMsg({ ok: false, text: res.error });
      return;
    }
    setMsg({ ok: true, text: "Queued. The worker picks it up within a few seconds." });
    form.reset();
    router.refresh();
  }

  async function publish(e: React.FormEvent<HTMLFormElement>, id: string) {
    e.preventDefault();
    setBusy(id);
    setMsg(null);
    const res = await publishConversion(new FormData(e.currentTarget));
    setBusy(null);
    setMsg(
      res.ok
        ? { ok: true, text: "Published. It is in the reading catalogue now." }
        : { ok: false, text: res.error },
    );
    router.refresh();
  }

  async function act(id: string, fn: (id: string) => Promise<{ ok: boolean; error?: string }>) {
    setBusy(id);
    setMsg(null);
    const res = await fn(id);
    setBusy(null);
    if (!res.ok) setMsg({ ok: false, text: res.error ?? "Failed." });
    router.refresh();
  }

  return (
    <div className="space-y-8">
      {/* ---------------------------------------------------------- submit */}
      <form
        ref={formRef}
        onSubmit={submit}
        className="rounded-xl border border-border bg-surface p-5 space-y-4"
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="text-sm">
            <span className="mb-1 block font-medium">Title</span>
            <input
              name="title"
              required
              placeholder="Volume 4 Test 1"
              className="w-full rounded-lg border border-border bg-background px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Test id</span>
            <input
              name="testId"
              required
              pattern="[A-Za-z0-9 \-]+"
              placeholder="vol4-test1"
              className="w-full rounded-lg border border-border bg-background px-3 py-2"
            />
            <span className="mt-1 block text-xs text-muted">
              Used as the folder name on your machine. Letters, numbers, hyphens.
            </span>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">PDF</span>
            <input
              name="file"
              type="file"
              accept="application/pdf,.pdf"
              required
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </label>
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={busy === "submit"}>
            {busy === "submit" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileUp className="mr-2 h-4 w-4" />
            )}
            Queue conversion
          </Button>
          <span className="text-xs text-muted">
            Your machine must be running the worker. A full test costs about $0.14.
          </span>
        </div>

        {msg && (
          <p className={`text-sm ${msg.ok ? "text-green-600" : "text-red-600"}`}>{msg.text}</p>
        )}
      </form>

      {/* ------------------------------------------------------------ jobs */}
      {jobs.length === 0 ? (
        <p className="text-sm text-muted">No conversions yet.</p>
      ) : (
        <ul className="space-y-3">
          {jobs.map((job) => {
            const shape = (job.shape ?? {}) as Shape;
            const report = (job.report ?? {}) as Report;
            const errata = (job.errata ?? []) as Erratum[];
            const expanded = open === job.id;
            return (
              <li key={job.id} className="rounded-xl border border-border bg-surface">
                <div className="flex flex-wrap items-center gap-3 p-4">
                  <StatusPill status={job.status} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{job.title}</p>
                    <p className="truncate text-xs text-muted">
                      {job.test_id}
                      {job.stage ? ` · ${job.stage}` : ""}
                      {typeof report.cost?.total === "number"
                        ? ` · $${report.cost.total.toFixed(4)}`
                        : ""}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setOpen(expanded ? null : job.id)}
                    className="text-sm text-muted hover:text-foreground"
                  >
                    {expanded ? "Hide" : "Details"}
                  </button>

                  {job.status === "queued" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy === job.id}
                      onClick={() => act(job.id, cancelConversion)}
                    >
                      Cancel
                    </Button>
                  )}
                  {job.status !== "running" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy === job.id}
                      onClick={() => act(job.id, deleteConversion)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                {expanded && (
                  <div className="space-y-4 border-t border-border p-4 text-sm">
                    {/* What the converter read out of the PDF. This is the
                        check worth doing: if the shape is wrong, everything
                        downstream inherits it. */}
                    {shape.passages && (
                      <div>
                        <p className="mb-1 font-medium">What it read</p>
                        <p className="text-xs text-muted">
                          {shape.parts} passage(s) · {shape.questions} questions
                          {shape.ranges ? ` (${shape.ranges})` : ""}
                          {typeof shape.figures === "number" ? ` · ${shape.figures} figure(s)` : ""}
                          {" · "}
                          {shape.printedKey
                            ? `${shape.printedKey} printed answers`
                            : "no printed key"}
                        </p>
                        <ul className="mt-2 space-y-1">
                          {shape.passages.map((p) => (
                            <li key={p.part} className="text-xs">
                              Part {p.part} — <span className="font-medium">{p.title}</span> ·{" "}
                              {p.paragraphs} paragraphs · {p.groups} group(s)
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {errata.length > 0 && (
                      <div>
                        <p className="mb-1 flex items-center gap-2 font-medium text-amber-600">
                          <AlertTriangle className="h-4 w-4" />
                          {errata.length} question(s) to check
                        </p>
                        <p className="mb-2 text-xs text-muted">
                          The printed key always ships. These are where a model
                          disagreed with it — or where the paper printed no key.
                        </p>
                        <ul className="space-y-1">
                          {errata.map((e) => (
                            <li key={e.q} className="text-xs">
                              <span className="font-medium">Q{e.q}</span> — book:{" "}
                              {e.printed ?? "none"} · A: {e.derivedA ?? "—"} · B:{" "}
                              {e.derivedB ?? "—"}{" "}
                              <span className="text-muted">({e.severity})</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {job.log && (
                      <details>
                        <summary className="cursor-pointer text-xs text-muted">Worker log</summary>
                        <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-background p-3 text-[11px] leading-relaxed">
                          {job.log}
                        </pre>
                      </details>
                    )}

                    {job.status === "passed" && (
                      <form
                        onSubmit={(e) => publish(e, job.id)}
                        className="flex flex-wrap items-end gap-3 border-t border-border pt-4"
                      >
                        <input type="hidden" name="id" value={job.id} />
                        {errata.some((e) => e.severity === "high") && (
                          <label className="flex w-full items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-2 text-xs">
                            <input type="checkbox" name="acknowledged" className="mt-0.5" />
                            <span>
                              I have checked Q
                              {errata
                                .filter((e) => e.severity === "high")
                                .map((e) => e.q)
                                .join(", Q")}{" "}
                              against the book. The printed key ships either way.
                            </span>
                          </label>
                        )}
                        <label className="text-xs">
                          <span className="mb-1 block font-medium">Tier</span>
                          <select
                            name="tier"
                            defaultValue="free"
                            className="rounded-lg border border-border bg-background px-2 py-1.5"
                          >
                            <option value="free">free</option>
                            <option value="premium">premium</option>
                          </select>
                        </label>
                        <label className="text-xs">
                          <span className="mb-1 block font-medium">Track</span>
                          <select
                            name="track"
                            defaultValue="regular"
                            className="rounded-lg border border-border bg-background px-2 py-1.5"
                          >
                            <option value="regular">regular</option>
                            <option value="pre_ielts">pre_ielts</option>
                            <option value="intro">intro</option>
                          </select>
                        </label>
                        <label className="text-xs">
                          <span className="mb-1 block font-medium">Level (optional)</span>
                          <input
                            name="level"
                            className="w-28 rounded-lg border border-border bg-background px-2 py-1.5"
                          />
                        </label>
                        <Button type="submit" size="sm" disabled={busy === job.id}>
                          {busy === job.id ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Upload className="mr-2 h-4 w-4" />
                          )}
                          Publish
                        </Button>
                      </form>
                    )}

                    {job.published_test_id && (
                      <p className="text-xs text-green-600">
                        Published — test id {job.published_test_id}
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="sr-only">{selfId}</p>
    </div>
  );
}

function StatusPill({ status }: { status: Job["status"] }) {
  const map: Record<Job["status"], { label: string; cls: string; icon: React.ReactNode }> = {
    queued: { label: "queued", cls: "bg-muted/15 text-muted", icon: null },
    running: {
      label: "building",
      cls: "bg-blue-500/10 text-blue-600",
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
    },
    passed: {
      label: "passed",
      cls: "bg-green-500/10 text-green-600",
      icon: <CheckCircle2 className="h-3 w-3" />,
    },
    failed: {
      label: "failed",
      cls: "bg-red-500/10 text-red-600",
      icon: <XCircle className="h-3 w-3" />,
    },
    published: { label: "published", cls: "bg-green-600/15 text-green-700", icon: null },
    cancelled: { label: "cancelled", cls: "bg-muted/15 text-muted", icon: null },
  };
  const s = map[status];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${s.cls}`}
    >
      {s.icon}
      {s.label}
    </span>
  );
}
