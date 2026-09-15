"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AtSign,
  Check,
  ChevronRight,
  Download,
  ImageIcon,
  Inbox,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  approveMockRequest,
  cancelMockAttempt,
  deleteMockDefinition,
  grantMockByEmail,
  rejectMockRequest,
  removeMockTask1Image,
  saveMockDefinition,
  uploadMockTask1Image,
} from "@/app/actions/mock";
import type { AdminAttemptSummary, AdminMock, AdminRequest, MockPaper } from "@/lib/mock";
import { STATUS_LABEL } from "@/lib/mock-shared";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn, timeAgo } from "@/lib/utils";

type Msg = { ok: boolean; text: string } | null;
type Tab = "requests" | "mocks" | "results";

export function AdminMocks({
  requests,
  mocks,
  papers,
  attempts,
}: {
  requests: AdminRequest[];
  mocks: AdminMock[];
  papers: MockPaper[];
  attempts: AdminAttemptSummary[];
}) {
  const pending = requests.filter((r) => r.status === "pending");
  const toGrade = attempts.filter((a) => a.status === "submitted");
  const [tab, setTab] = useState<Tab>(pending.length ? "requests" : toGrade.length ? "results" : "mocks");
  const [msg, setMsg] = useState<Msg>(null);

  return (
    <div className="space-y-5">
      <nav className="flex flex-wrap gap-1.5">
        {(
          [
            ["requests", `Requests${pending.length ? ` (${pending.length})` : ""}`],
            ["mocks", `Mocks (${mocks.length})`],
            ["results", `Results (${attempts.length})${toGrade.length ? ` · ${toGrade.length} to grade` : ""}`],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => {
              setTab(id);
              setMsg(null);
            }}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              tab === id ? "bg-primary/10 text-primary" : "text-muted hover:bg-surface-2 hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </nav>

      {msg && (
        <p
          className={cn(
            "sticky top-0 z-10 rounded-lg border bg-surface px-3 py-2 text-sm shadow-soft",
            msg.ok ? "border-success/30 text-success" : "border-danger/30 text-danger",
          )}
        >
          {msg.text}
        </p>
      )}

      {tab === "requests" && <Requests requests={requests} mocks={mocks} onMsg={setMsg} />}
      {tab === "mocks" && <Mocks mocks={mocks} papers={papers} onMsg={setMsg} />}
      {tab === "results" && <Results attempts={attempts} onMsg={setMsg} />}
    </div>
  );
}

/**
 * Runs an action in a React 19 transition and refreshes the route — never
 * `window.location.reload()` (see the Discipline section of CLAUDE.md: a reload
 * loses the scroll position and the confirmation message).
 */
function useRunner(onMsg: (m: Msg) => void) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [key, setKey] = useState<string | null>(null);

  function run(
    innerKey: string,
    fn: () => Promise<{ ok: true } | { ok: false; error: string }>,
    okText: string,
    onSuccess?: () => void,
  ) {
    setKey(innerKey);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        onMsg({ ok: false, text: res.error });
        return;
      }
      onMsg({ ok: true, text: okText });
      onSuccess?.();
      router.refresh();
    });
  }

  return { busy: pending ? key : null, run };
}

// ------------------------------------------------------------------ requests

function Requests({
  requests,
  mocks,
  onMsg,
}: {
  requests: AdminRequest[];
  mocks: AdminMock[];
  onMsg: (m: Msg) => void;
}) {
  const { busy, run } = useRunner(onMsg);
  const [email, setEmail] = useState("");
  const published = mocks.filter((m) => m.published || m.listening_test_id);
  const [mockId, setMockId] = useState(published[0]?.id ?? "");
  const pending = requests.filter((r) => r.status === "pending");
  const decided = requests.filter((r) => r.status !== "pending");

  return (
    <div className="space-y-5">
      <Card className="space-y-3">
        <h2 className="font-semibold">Waiting for you</h2>
        {pending.length === 0 ? (
          <EmptyState
            icon={<Inbox className="h-5 w-5" />}
            title="Nothing pending"
            desc="New requests appear here, and on Telegram with Approve / Reject buttons."
          />
        ) : (
          <ul className="divide-y divide-border">
            {pending.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{r.name || r.email || "A student"}</p>
                  <p className="text-xs text-muted">
                    {r.email} · <span className="font-medium text-foreground">{r.mock_title}</span>
                  </p>
                  {r.message && <p className="mt-1 text-sm italic text-muted">“{r.message}”</p>}
                  <p className="mt-1 text-xs text-muted">asked {timeAgo(r.created_at)}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    disabled={busy === r.id}
                    onClick={() =>
                      run(r.id, () => approveMockRequest(r.id), `${r.name || r.email} can now sit ${r.mock_title}.`)
                    }
                  >
                    {busy === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === r.id}
                    onClick={() => run(r.id, () => rejectMockRequest(r.id), `Request from ${r.name || r.email} rejected.`)}
                  >
                    <X className="h-4 w-4" /> Reject
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">Give a student a place directly</h2>
        <p className="text-sm text-muted">For someone who asked you in person — no request needed.</p>
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run("grant", () => grantMockByEmail(email, mockId), `${email} now has a place.`, () => setEmail(""));
          }}
        >
          <label className="flex min-w-0 flex-1 basis-56 items-center gap-2 rounded-lg border border-border bg-surface-2 px-3">
            <AtSign className="h-4 w-4 shrink-0 text-muted" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="student@example.com"
              className="h-10 w-full bg-transparent text-sm outline-none"
            />
          </label>
          <select
            value={mockId}
            onChange={(e) => setMockId(e.target.value)}
            required
            className="admin-input h-10 min-w-0 basis-48"
          >
            {published.length === 0 && <option value="">No mocks yet</option>}
            {published.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
                {m.published ? "" : " (draft)"}
              </option>
            ))}
          </select>
          <Button type="submit" disabled={busy === "grant" || !mockId}>
            {busy === "grant" && <Loader2 className="h-4 w-4 animate-spin" />}
            Give place
          </Button>
        </form>
      </Card>

      {decided.length > 0 && (
        <Card className="space-y-3">
          <h2 className="font-semibold">Already answered</h2>
          <ul className="divide-y divide-border">
            {decided.slice(0, 50).map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{r.name || r.email || "A student"}</p>
                  <p className="text-xs text-muted">{r.mock_title}</p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded px-1.5 py-0.5 text-xs font-medium",
                    r.status === "approved" ? "bg-success/10 text-success" : "bg-danger/10 text-danger",
                  )}
                >
                  {r.status}
                  {r.decided_at ? ` · ${timeAgo(r.decided_at)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

// --------------------------------------------------------------------- mocks

function Mocks({ mocks, papers, onMsg }: { mocks: AdminMock[]; papers: MockPaper[]; onMsg: (m: Msg) => void }) {
  const [editing, setEditing] = useState<string | "new" | null>(mocks.length ? null : "new");
  const { busy, run } = useRunner(onMsg);

  return (
    <div className="space-y-5">
      <Card className="space-y-2 text-sm text-muted">
        <p>
          <span className="font-medium text-foreground">Papers:</span> upload the Listening and Reading
          HTML on{" "}
          <Link href="/admin/tests" className="underline">
            Manage tests
          </Link>{" "}
          with <span className="font-medium">For</span> set to “Mock exam only”. They never appear in the
          public catalogue. {papers.length} mock paper{papers.length === 1 ? "" : "s"} uploaded.
        </p>
      </Card>

      {editing === "new" ? (
        <MockForm papers={papers} onMsg={onMsg} onDone={() => setEditing(null)} />
      ) : (
        <Button onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" /> New mock
        </Button>
      )}

      {mocks.map((m) =>
        editing === m.id ? (
          <MockForm key={m.id} mock={m} papers={papers} onMsg={onMsg} onDone={() => setEditing(null)} />
        ) : (
          <Card key={m.id} className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <p className="flex items-center gap-2 font-semibold">
                {m.title}
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-xs font-medium",
                    m.published ? "bg-success/10 text-success" : "bg-surface-2 text-muted",
                  )}
                >
                  {m.published ? "published" : "draft"}
                </span>
              </p>
              <p className="text-xs text-muted">Listening: {m.listening_title ?? "—"}</p>
              <p className="text-xs text-muted">Reading: {m.reading_title ?? "—"}</p>
              <p className="text-xs text-muted">
                Writing: {m.writing_minutes} min{m.writing_task1_image_path ? " · Task 1 image" : ""} ·{" "}
                {m.attempts} attempt{m.attempts === 1 ? "" : "s"}
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setEditing(m.id)}>
                <Pencil className="h-4 w-4" /> Edit
              </Button>
              {m.attempts === 0 && (
                <Button
                  size="sm"
                  variant="danger"
                  disabled={busy === m.id}
                  onClick={() => {
                    if (!confirm(`Delete "${m.title}"? This cannot be undone.`)) return;
                    run(m.id, () => deleteMockDefinition(m.id), `Deleted ${m.title}.`);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </Card>
        ),
      )}
    </div>
  );
}

function MockForm({
  mock,
  papers,
  onMsg,
  onDone,
}: {
  mock?: AdminMock;
  papers: MockPaper[];
  onMsg: (m: Msg) => void;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [imgPending, startImg] = useTransition();
  const [form, setForm] = useState({
    title: mock?.title ?? "",
    description: mock?.description ?? "",
    listening_test_id: mock?.listening_test_id ?? "",
    reading_test_id: mock?.reading_test_id ?? "",
    writing_task1_prompt: mock?.writing_task1_prompt ?? "",
    writing_task2_prompt: mock?.writing_task2_prompt ?? "",
    writing_minutes: mock?.writing_minutes ?? 60,
    published: mock?.published ?? false,
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const listening = papers.filter((p) => p.skill === "listening");
  const reading = papers.filter((p) => p.skill === "reading");

  function save() {
    startTransition(async () => {
      const res = await saveMockDefinition({
        id: mock?.id,
        ...form,
        description: form.description || null,
        listening_test_id: form.listening_test_id || null,
        reading_test_id: form.reading_test_id || null,
        writing_minutes: Number(form.writing_minutes),
      });
      if (!res.ok) {
        onMsg({ ok: false, text: res.error });
        return;
      }
      onMsg({ ok: true, text: `Saved ${form.title}.` });
      router.refresh();
      if (mock) onDone();
      else onDone();
    });
  }

  return (
    <Card className="space-y-4 border-primary/30">
      <h2 className="font-semibold">{mock ? `Edit ${mock.title}` : "New mock"}</h2>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Title</span>
        <input className="admin-input" value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Mock 1 — September" />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Description (optional)</span>
        <input className="admin-input" value={form.description} onChange={(e) => set("description", e.target.value)} />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Listening paper</span>
          <select className="admin-input" value={form.listening_test_id} onChange={(e) => set("listening_test_id", e.target.value)}>
            <option value="">Choose…</option>
            {listening.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Reading paper</span>
          <select className="admin-input" value={form.reading_test_id} onChange={(e) => set("reading_test_id", e.target.value)}>
            <option value="">Choose…</option>
            {reading.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Writing Task 1 prompt</span>
        <textarea
          className="admin-input min-h-28 py-2"
          value={form.writing_task1_prompt}
          onChange={(e) => set("writing_task1_prompt", e.target.value)}
          placeholder="The chart below shows… Summarise the information by selecting and reporting the main features, and make comparisons where relevant."
        />
      </label>

      {mock ? (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <p className="flex items-center gap-2 text-sm font-medium">
            <ImageIcon className="h-4 w-4" /> Task 1 image {mock.writing_task1_image_path ? "(uploaded)" : "(none)"}
          </p>
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              fd.set("mockId", mock.id);
              startImg(async () => {
                const res = await uploadMockTask1Image(fd);
                onMsg(res.ok ? { ok: true, text: "Task 1 image uploaded." } : { ok: false, text: res.error });
                if (res.ok) router.refresh();
              });
            }}
          >
            <input type="file" name="file" accept="image/*" required className="text-sm" />
            <Button size="sm" type="submit" disabled={imgPending}>
              {imgPending && <Loader2 className="h-4 w-4 animate-spin" />} Upload
            </Button>
            {mock.writing_task1_image_path && (
              <Button
                size="sm"
                variant="outline"
                type="button"
                disabled={imgPending}
                onClick={() =>
                  startImg(async () => {
                    const res = await removeMockTask1Image(mock.id);
                    onMsg(res.ok ? { ok: true, text: "Image removed." } : { ok: false, text: res.error });
                    if (res.ok) router.refresh();
                  })
                }
              >
                Remove
              </Button>
            )}
          </form>
        </div>
      ) : (
        <p className="text-xs text-muted">Save the mock first, then edit it to upload a Task 1 image.</p>
      )}

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Writing Task 2 prompt</span>
        <textarea
          className="admin-input min-h-28 py-2"
          value={form.writing_task2_prompt}
          onChange={(e) => set("writing_task2_prompt", e.target.value)}
          placeholder="Some people believe… To what extent do you agree or disagree?"
        />
      </label>

      <div className="flex flex-wrap items-end gap-4">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Writing time (minutes)</span>
          <input
            type="number"
            min={10}
            max={180}
            className="admin-input w-28"
            value={form.writing_minutes}
            onChange={(e) => set("writing_minutes", Number(e.target.value))}
          />
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" checked={form.published} onChange={(e) => set("published", e.target.checked)} />
          Published — students can see and request it
        </label>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button onClick={save} disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          Save
        </Button>
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------- results

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function Results({ attempts, onMsg }: { attempts: AdminAttemptSummary[]; onMsg: (m: Msg) => void }) {
  const { busy, run } = useRunner(onMsg);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return attempts.filter(
      (a) =>
        (status === "all" || a.status === status) &&
        (!needle ||
          [a.student_name, a.student_email, a.mock_title].some((v) => v?.toLowerCase().includes(needle))),
    );
  }, [attempts, q, status]);

  function exportCsv() {
    const header = ["student", "email", "mock", "status", "listening", "reading", "writing", "overall", "submitted", "released"];
    const lines = filtered.map((a) =>
      [a.student_name, a.student_email, a.mock_title, a.status, a.listening_band, a.reading_band, a.writing_band, a.overall_band, a.submitted_at, a.released_at]
        .map(csvCell)
        .join(","),
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `mock-results-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const fmt = (b: number | null) => (b == null ? "—" : b.toFixed(1));

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search student or mock"
          className="admin-input h-9 min-w-0 flex-1 basis-48"
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="admin-input h-9 w-auto">
          <option value="all">All statuses</option>
          <option value="submitted">To grade / release</option>
          <option value="released">Released</option>
          <option value="in_progress">In progress</option>
          <option value="approved">Not started</option>
        </select>
        <Button size="sm" variant="outline" onClick={exportCsv} disabled={!filtered.length}>
          <Download className="h-4 w-4" /> CSV
        </Button>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted">No attempts{attempts.length ? " match" : " yet"}.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="py-2 pr-3 font-medium">Student</th>
                <th className="py-2 pr-3 font-medium">Mock</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-2 text-center font-medium">L</th>
                <th className="py-2 pr-2 text-center font-medium">R</th>
                <th className="py-2 pr-2 text-center font-medium">W</th>
                <th className="py-2 pr-3 text-center font-medium">Overall</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id} className="border-b border-border/60 last:border-0">
                  <td className="py-2 pr-3">
                    <p className="font-medium">{a.student_name || a.student_email || "Student"}</p>
                    <p className="text-xs text-muted">
                      {a.student_email}
                      {!a.user_id && " · account deleted"}
                    </p>
                  </td>
                  <td className="py-2 pr-3">{a.mock_title}</td>
                  <td className="py-2 pr-3">
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-xs font-medium",
                        a.status === "released"
                          ? "bg-success/10 text-success"
                          : a.status === "submitted"
                            ? "bg-warning/10 text-warning"
                            : "bg-surface-2 text-muted",
                      )}
                    >
                      {a.status === "submitted" ? (a.writing_band == null ? "To grade" : "To release") : STATUS_LABEL[a.status]}
                    </span>
                    <p className="mt-0.5 text-xs text-muted">
                      {timeAgo(a.released_at ?? a.submitted_at ?? a.started_at ?? a.approved_at)}
                    </p>
                  </td>
                  <td className="py-2 pr-2 text-center tabular-nums">{fmt(a.listening_band)}</td>
                  <td className="py-2 pr-2 text-center tabular-nums">{fmt(a.reading_band)}</td>
                  <td className="py-2 pr-2 text-center tabular-nums">{fmt(a.writing_band)}</td>
                  <td className="py-2 pr-3 text-center font-semibold tabular-nums">{fmt(a.overall_band)}</td>
                  <td className="py-2 text-right">
                    {a.status === "approved" && !a.started_at ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy === a.id}
                        onClick={() => {
                          if (!confirm("Withdraw this unused place?")) return;
                          run(a.id, () => cancelMockAttempt(a.id), "Place withdrawn.");
                        }}
                      >
                        Withdraw
                      </Button>
                    ) : (
                      <Link
                        href={`/admin/mocks/attempts/${a.id}`}
                        className="inline-flex items-center gap-0.5 text-sm font-medium text-primary hover:underline"
                      >
                        Open <ChevronRight className="h-4 w-4" />
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
