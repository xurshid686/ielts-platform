"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  AtSign,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Eye,
  EyeOff,
  ImageIcon,
  Inbox,
  Loader2,
  Lock,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  approveMockRequest,
  bulkApproveMockRequests,
  bulkReleaseMockAttempts,
  cancelMockAttempt,
  deleteMockDefinition,
  duplicateMockAction,
  grantMockByEmail,
  rejectMockRequest,
  removeMockTask1Image,
  saveMockDefinition,
  setMockPublishedAction,
  uploadMockTask1Image,
} from "@/app/actions/mock";
import type { AdminAttemptSummary, AdminMock, AdminRequest, MockPaper } from "@/lib/mock-admin";
import { STAGE_GROUPS, STAGE_LABEL, csvCell, tashkent, type AdminStage, type StageGroup } from "@/lib/mock-shared";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn, timeAgo } from "@/lib/utils";

// ------------------------------------------------------------------- shared

type Msg = { ok: boolean; text: string; details?: string[] } | null;
type Tab = "requests" | "mocks" | "results";
type ActionResult = { ok: true; note?: string } | { ok: false; error: string; issues?: string[] };

const TABS: Tab[] = ["requests", "mocks", "results"];
const PAGE_SIZE = 50;

const fmtBand = (b: number | null) => (b == null ? "—" : b.toFixed(1));

/**
 * Filters live in the URL, so leaving for an attempt and pressing Back — or
 * sharing the link — lands on the same view. Writes use replace + scroll:false
 * so filtering does not stack history or jump the page.
 */
function useUrlState() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const get = useCallback((k: string) => params.get(k) ?? "", [params]);
  const set = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v == null || v === "") next.delete(k);
        else next.set(k, v);
      }
      // Any filter change other than paging resets to page 1.
      if (!("page" in patch)) next.delete("page");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );
  return { get, set, query: params.toString() };
}

/**
 * Runs owner actions. ONE pending flag for the whole panel: while anything is
 * running, every action button is disabled — the review found that per-row
 * keys let a second click make the first row look finished while it was still
 * running. Thrown errors become a message instead of a lost click.
 */
function useRunner(onMsg: (m: Msg) => void) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run<T extends ActionResult>(fn: () => Promise<T>, okText: string | ((r: T) => string), onSuccess?: (r: T) => void) {
    startTransition(async () => {
      try {
        const res = await fn();
        if (!res.ok) {
          onMsg({ ok: false, text: res.error, details: res.issues });
          return;
        }
        onMsg({ ok: true, text: typeof okText === "function" ? okText(res) : res.note ? `${okText} ${res.note}` : okText });
        onSuccess?.(res);
        router.refresh();
      } catch {
        onMsg({ ok: false, text: "Couldn't reach the server. Nothing was changed — check your connection and try again." });
      }
    });
  }
  return { busy: pending, run };
}

function bulkText(verb: string, outcome: { done: number; skipped: { id: string; reason: string }[] }) {
  return outcome.skipped.length
    ? `${outcome.done} ${verb}, ${outcome.skipped.length} skipped.`
    : `${outcome.done} ${verb}.`;
}

function downloadCsv(lines: string[], filename: string) {
  // BOM so Excel opens UTF-8 names (Uzbek/Cyrillic) correctly.
  const BOM = String.fromCharCode(0xfeff);
  const blob = new Blob([BOM + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// -------------------------------------------------------------------- panel

export function AdminMocks({
  pending,
  decisions,
  mocks,
  papers,
  attempts,
  images,
}: {
  pending: AdminRequest[];
  decisions: AdminRequest[];
  mocks: AdminMock[];
  papers: MockPaper[];
  attempts: AdminAttemptSummary[];
  images: Record<string, string>;
}) {
  const url = useUrlState();
  const router = useRouter();
  const [msg, setMsg] = useState<Msg>(null);
  const [refreshing, startRefresh] = useTransition();
  const dirtyRef = useRef(false);

  const tabParam = url.get("tab") as Tab;
  const tab: Tab = TABS.includes(tabParam) ? tabParam : pending.length ? "requests" : "results";
  const mockId = mocks.some((m) => m.id === url.get("mock")) ? url.get("mock") : "";
  const scopedMock = mocks.find((m) => m.id === mockId) ?? null;

  const scopedAttempts = useMemo(
    () => (mockId ? attempts.filter((a) => a.mock_id === mockId) : attempts),
    [attempts, mockId],
  );
  const scopedPending = mockId ? pending.filter((r) => r.mock_id === mockId) : pending;
  const count = (g: StageGroup) =>
    scopedAttempts.filter((a) => (STAGE_GROUPS[g] as readonly AdminStage[]).includes(a.stage)).length;

  function go(patch: Record<string, string | null>) {
    if (dirtyRef.current && !confirm("You have unsaved changes to a mock. Leave them?")) return;
    dirtyRef.current = false;
    setMsg(null);
    url.set(patch);
  }

  const firstToGrade = scopedAttempts
    .filter((a) => a.stage === "needs_grading")
    .sort((a, b) => (a.submitted_at ?? "").localeCompare(b.submitted_at ?? ""))[0];

  return (
    <div className="space-y-5">
      {/* Workload — each count is a filter. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(
          [
            { label: "Requests waiting", value: scopedPending.length, patch: { tab: "requests", stage: null } },
            { label: "Needs grading", value: count("needs_grading"), patch: { tab: "results", stage: "needs_grading" } },
            { label: "Ready to release", value: count("ready_to_release"), patch: { tab: "results", stage: "ready_to_release" } },
            { label: "In progress", value: count("in_progress"), patch: { tab: "results", stage: "in_progress" } },
          ] as const
        ).map((w) => {
          const active = tab === w.patch.tab && (w.patch.stage ?? "") === (tab === "results" ? url.get("stage") : "");
          return (
            <button
              key={w.label}
              onClick={() => go(w.patch)}
              className={cn(
                "rounded-xl border px-3 py-2.5 text-left transition-colors hover:border-primary/40",
                active ? "border-primary bg-primary/10" : w.value > 0 ? "border-primary/30 bg-primary/5" : "border-border bg-surface",
              )}
            >
              <p className="text-2xl font-bold tabular-nums">{w.value}</p>
              <p className="text-xs text-muted">{w.label}</p>
            </button>
          );
        })}
      </div>

      {/* Scope: one mock, or all. */}
      <Card className="flex flex-wrap items-center gap-3 p-3">
        <label className="flex min-w-0 flex-1 basis-60 items-center gap-2 text-sm">
          <span className="shrink-0 text-muted">Mock</span>
          <select
            aria-label="Show one mock"
            value={mockId}
            onChange={(e) => go({ mock: e.target.value || null })}
            className="admin-input h-10 min-w-0 flex-1"
          >
            <option value="">All mocks</option>
            {mocks.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title} — {m.counts.total} place{m.counts.total === 1 ? "" : "s"}
              </option>
            ))}
          </select>
        </label>
        {scopedMock && (
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("rounded px-2 py-1 text-xs font-medium", scopedMock.published ? "bg-success/10 text-success" : "bg-surface-2 text-muted")}>
              {scopedMock.published ? "Published" : scopedMock.issues.length ? "Incomplete draft" : "Ready, unpublished"}
            </span>
            {firstToGrade && (
              <Link
                href={`/admin/mocks/attempts/${firstToGrade.id}?back=${encodeURIComponent(url.query)}`}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground"
              >
                <Pencil className="h-4 w-4" /> Grade next ({count("needs_grading")})
              </Link>
            )}
          </div>
        )}
        <Button
          variant="outline"
          className="h-10"
          disabled={refreshing}
          onClick={() => startRefresh(() => router.refresh())}
          aria-label="Refresh data"
          title="Pick up Telegram approvals and new submissions"
        >
          <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      </Card>

      <nav className="flex flex-wrap gap-1.5" aria-label="Mock admin sections">
        {(
          [
            ["requests", `Requests${scopedPending.length ? ` (${scopedPending.length})` : ""}`],
            ["results", `Results (${scopedAttempts.length})`],
            ["mocks", `Mocks (${mocks.length})`],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => go({ tab: id, stage: null, q: null, from: null, to: null })}
            aria-current={tab === id ? "page" : undefined}
            className={cn(
              "h-10 rounded-lg px-3 text-sm font-medium transition-colors",
              tab === id ? "bg-primary/10 text-primary" : "text-muted hover:bg-surface-2 hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </nav>

      {msg && (
        // Offset below the 64px sticky site header, which it used to sit behind.
        <div
          role="status"
          className={cn(
            "sticky top-[4.5rem] z-30 flex items-start justify-between gap-3 rounded-lg border bg-surface px-3 py-2 text-sm shadow-soft",
            msg.ok ? "border-success/30 text-success" : "border-danger/30 text-danger",
          )}
        >
          <div>
            <p>{msg.text}</p>
            {msg.details?.length ? (
              <ul className="mt-1 list-disc pl-5 text-xs">
                {msg.details.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            ) : null}
          </div>
          <button onClick={() => setMsg(null)} aria-label="Dismiss message" className="shrink-0 p-1">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {tab === "requests" && (
        <Requests pending={scopedPending} decisions={decisions} mocks={mocks} scopedMockId={mockId} onMsg={setMsg} onCreateMock={() => go({ tab: "mocks" })} />
      )}
      {tab === "results" && (
        <Results attempts={scopedAttempts} allCount={attempts.length} onMsg={setMsg} url={url} go={go} hasMocks={mocks.length > 0} />
      )}
      {tab === "mocks" && (
        <Mocks
          mocks={mocks}
          papers={papers}
          images={images}
          onMsg={setMsg}
          onDirty={(d) => (dirtyRef.current = d)}
          openResults={(id) => go({ tab: "results", mock: id, stage: null })}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ requests

function Requests({
  pending,
  decisions,
  mocks,
  scopedMockId,
  onMsg,
  onCreateMock,
}: {
  pending: AdminRequest[];
  decisions: AdminRequest[];
  mocks: AdminMock[];
  scopedMockId: string;
  onMsg: (m: Msg) => void;
  onCreateMock: () => void;
}) {
  const { busy, run } = useRunner(onMsg);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [email, setEmail] = useState("");
  const grantable = mocks.filter((m) => !m.issues.length);
  const [grantMock, setGrantMock] = useState(scopedMockId || grantable[0]?.id || "");

  const visibleSelected = pending.filter((r) => selected.has(r.id));
  const allSelected = pending.length > 0 && visibleSelected.length === pending.length;
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const byMock = Object.entries(
    visibleSelected.reduce<Record<string, number>>((acc, r) => ((acc[r.mock_title] = (acc[r.mock_title] ?? 0) + 1), acc), {}),
  );

  return (
    <div className="space-y-5">
      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Waiting for you</h2>
          {pending.length > 0 && (
            <div className="flex items-center gap-2">
              <label className="flex h-10 items-center gap-2 px-1 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={allSelected}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(pending.map((r) => r.id)))}
                />
                Select all ({pending.length})
              </label>
              <Button disabled={busy || !visibleSelected.length} onClick={() => setConfirming(true)}>
                <Check className="h-4 w-4" /> Approve selected ({visibleSelected.length})
              </Button>
            </div>
          )}
        </div>

        {pending.length === 0 ? (
          <EmptyState
            icon={<Inbox className="h-5 w-5" />}
            title="Nothing pending"
            desc={
              mocks.some((m) => m.published)
                ? "New requests appear here, and on Telegram with Approve / Reject buttons."
                : "No mock is published yet, so students have nothing to request."
            }
            action={
              !mocks.some((m) => m.published) ? (
                <Button onClick={onCreateMock}>
                  <Plus className="h-4 w-4" /> {mocks.length ? "Publish a mock" : "Create a mock"}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="divide-y divide-border">
            {pending.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start gap-3 py-3">
                <input
                  type="checkbox"
                  className="mt-1 h-5 w-5 shrink-0"
                  aria-label={`Select ${r.name || r.email}`}
                  checked={selected.has(r.id)}
                  onChange={() => toggle(r.id)}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{r.name || r.email || "A student"}</p>
                  <p className="break-all text-xs text-muted">
                    {r.email} · <span className="font-medium text-foreground">{r.mock_title}</span>
                  </p>
                  {r.message && <p className="mt-1 text-sm italic text-muted">“{r.message}”</p>}
                  <p className="mt-1 text-xs text-muted" title={tashkent(r.created_at)}>
                    asked {timeAgo(r.created_at)}
                  </p>
                </div>
                <div className="flex w-full shrink-0 gap-2 sm:w-auto">
                  <Button
                    className="h-10 flex-1 sm:flex-none"
                    disabled={busy}
                    onClick={() => run(() => approveMockRequest(r.id), `${r.name || r.email} can now sit ${r.mock_title}.`)}
                  >
                    <Check className="h-4 w-4" /> Approve
                  </Button>
                  <Button
                    variant="outline"
                    className="h-10 flex-1 sm:flex-none"
                    disabled={busy}
                    onClick={() => {
                      if (!confirm(`Reject ${r.name || r.email}'s request for ${r.mock_title}?`)) return;
                      run(() => rejectMockRequest(r.id), `Request from ${r.name || r.email} rejected.`);
                    }}
                  >
                    <X className="h-4 w-4" /> Reject
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {confirming && (
        <Modal title={`Approve ${visibleSelected.length} request${visibleSelected.length === 1 ? "" : "s"}?`} onClose={() => setConfirming(false)}>
          <ul className="space-y-1 text-sm">
            {byMock.map(([title, n]) => (
              <li key={title}>
                <span className="font-medium">{n}</span> for {title}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">Each student is notified. Anything that cannot be approved is skipped and listed.</p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirming(false)}>Cancel</Button>
            <Button
              disabled={busy}
              onClick={() => {
                const ids = visibleSelected.map((r) => r.id);
                setConfirming(false);
                run(
                  async () => {
                    const res = await bulkApproveMockRequests(ids);
                    if (!res.ok) return res;
                    // Failed selections stay selected so they can be retried.
                    const skipped = new Set(res.outcome.skipped.map((s) => s.id));
                    setSelected(skipped);
                    if (res.outcome.skipped.length) {
                      const names = new Map(pending.map((p) => [p.id, p.name || p.email || "A student"]));
                      onMsg({
                        ok: false,
                        text: bulkText("approved", res.outcome),
                        details: res.outcome.skipped.map((s) => `${names.get(s.id)}: ${s.reason}`),
                      });
                    }
                    return { ok: true as const, note: bulkText("approved", res.outcome) };
                  },
                  (r) => (r.ok && r.note) || "Done.",
                );
              }}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Approve
            </Button>
          </div>
        </Modal>
      )}

      <Card className="space-y-3">
        <h2 className="font-semibold">Give a student a place directly</h2>
        <p className="text-sm text-muted">For someone who asked you in person — no request needed. Closes any request they already sent.</p>
        {grantable.length === 0 ? (
          <p className="text-sm text-muted">No mock is complete yet. Finish one on the Mocks tab first.</p>
        ) : (
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => grantMockByEmail(email, grantMock), `${email} now has a place.`, () => setEmail(""));
            }}
          >
            <label className="flex h-10 min-w-0 flex-1 basis-56 items-center gap-2 rounded-lg border border-border bg-surface-2 px-3">
              <AtSign className="h-4 w-4 shrink-0 text-muted" />
              <input
                type="email"
                required
                aria-label="Student email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="student@example.com"
                className="h-full w-full bg-transparent text-sm outline-none"
              />
            </label>
            <select
              aria-label="Mock to give a place on"
              value={grantMock}
              onChange={(e) => setGrantMock(e.target.value)}
              required
              className="admin-input h-10 min-w-0 flex-1 basis-48"
            >
              {grantable.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                  {m.published ? "" : " (unpublished)"}
                </option>
              ))}
            </select>
            <Button type="submit" className="h-10" disabled={busy || !grantMock}>
              Give place
            </Button>
          </form>
        )}
      </Card>

      {decisions.length > 0 && (
        <Card className="space-y-3">
          <h2 className="font-semibold">Recently answered</h2>
          <ul className="divide-y divide-border">
            {decisions.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{r.name || r.email || "A student"}</p>
                  <p className="text-xs text-muted">{r.mock_title}</p>
                </div>
                <span
                  title={tashkent(r.decided_at)}
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

// ------------------------------------------------------------------- results

const STAGE_CHIPS: { id: StageGroup | ""; label: string }[] = [
  { id: "", label: "All" },
  { id: "needs_grading", label: "Needs grading" },
  { id: "ready_to_release", label: "Ready to release" },
  { id: "in_progress", label: "In progress" },
  { id: "not_started", label: "Not started" },
  { id: "released", label: "Released" },
];

const stageTone: Record<AdminStage, string> = {
  not_started: "bg-surface-2 text-muted",
  listening: "bg-primary/10 text-primary",
  reading: "bg-primary/10 text-primary",
  writing: "bg-primary/10 text-primary",
  needs_grading: "bg-warning/10 text-warning",
  ready_to_release: "bg-accent/15 text-accent",
  released: "bg-success/10 text-success",
};

function Results({
  attempts,
  allCount,
  onMsg,
  url,
  go,
  hasMocks,
}: {
  attempts: AdminAttemptSummary[];
  allCount: number;
  onMsg: (m: Msg) => void;
  url: ReturnType<typeof useUrlState>;
  go: (patch: Record<string, string | null>) => void;
  hasMocks: boolean;
}) {
  const { busy, run } = useRunner(onMsg);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [q, setQ] = useState(url.get("q"));
  const integrityOnly = url.get("integrity") === "review";
  const reviewCount = attempts.filter((a) => a.integrity.level === "review").length;
  // Students still sitting each mock — releasing now lets answers reach them (0052).
  const sittingByMock = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of attempts) {
      if (["not_started", "listening", "reading", "writing"].includes(a.stage)) m.set(a.mock_title, (m.get(a.mock_title) ?? 0) + 1);
    }
    return m;
  }, [attempts]);

  const stage = (Object.keys(STAGE_GROUPS) as StageGroup[]).includes(url.get("stage") as StageGroup)
    ? (url.get("stage") as StageGroup)
    : "";
  const from = url.get("from");
  const to = url.get("to");
  const sort = url.get("sort") || "newest";
  const page = Math.max(1, Number(url.get("page")) || 1);

  // Debounce the search box into the URL.
  useEffect(() => {
    if (q === url.get("q")) return;
    const t = setTimeout(() => url.set({ q: q || null }), 300);
    return () => clearTimeout(t);
  }, [q, url]);

  const filtered = useMemo(() => {
    const needle = url.get("q").trim().toLowerCase();
    const fromT = from ? new Date(`${from}T00:00:00+05:00`).getTime() : null;
    const toT = to ? new Date(`${to}T23:59:59+05:00`).getTime() : null;
    const list = attempts.filter((a) => {
      if (stage && !(STAGE_GROUPS[stage] as readonly AdminStage[]).includes(a.stage)) return false;
      if (integrityOnly && a.integrity.level !== "review") return false;
      if (needle && ![a.student_name, a.student_email, a.mock_title].some((v) => v?.toLowerCase().includes(needle))) return false;
      const when = new Date(a.submitted_at ?? a.approved_at).getTime();
      if (fromT != null && when < fromT) return false;
      if (toT != null && when > toT) return false;
      return true;
    });
    const key = (a: AdminAttemptSummary) => a.submitted_at ?? a.approved_at;
    return list.sort((a, b) => {
      if (sort === "oldest") return key(a).localeCompare(key(b));
      if (sort === "overall") return (b.overall_band ?? -1) - (a.overall_band ?? -1);
      if (sort === "name") return (a.student_name ?? a.student_email ?? "").localeCompare(b.student_name ?? b.student_email ?? "");
      return key(b).localeCompare(key(a));
    });
  }, [attempts, stage, integrityOnly, from, to, sort, url]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((Math.min(page, pages) - 1) * PAGE_SIZE, Math.min(page, pages) * PAGE_SIZE);
  const readyOnPage = pageRows.filter((a) => a.stage === "ready_to_release");
  const readyAll = filtered.filter((a) => a.stage === "ready_to_release");
  const chosen = filtered.filter((a) => selected.has(a.id) && a.stage === "ready_to_release");
  const back = encodeURIComponent(url.query);

  function exportCsv() {
    const header = ["student", "email", "mock", "stage", "listening", "reading", "writing", "overall", "approved", "submitted", "released", "integrity", "integrity_reasons"];
    const lines = filtered.map((a) =>
      [a.student_name, a.student_email, a.mock_title, STAGE_LABEL[a.stage], a.listening_band, a.reading_band, a.writing_band, a.overall_band, a.approved_at, a.submitted_at, a.released_at, a.integrity.level, a.integrity.reasons.join("; ")]
        .map(csvCell)
        .join(","),
    );
    downloadCsv([header.join(","), ...lines], `mock-results-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  if (allCount === 0) {
    return (
      <EmptyState
        icon={<Inbox className="h-5 w-5" />}
        title="No attempts yet"
        desc={hasMocks ? "Attempts appear here once you approve a request or give a student a place." : "Create a mock first, then approve places."}
        action={<Button onClick={() => go({ tab: hasMocks ? "requests" : "mocks" })}>{hasMocks ? "Go to requests" : "Create a mock"}</Button>}
      />
    );
  }

  return (
    <Card className="space-y-4">
      {/* Filters */}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by stage">
          {STAGE_CHIPS.map((c) => (
            <button
              key={c.id || "all"}
              onClick={() => url.set({ stage: c.id || null })}
              aria-pressed={stage === c.id}
              className={cn(
                "h-9 rounded-full border px-3 text-xs font-medium",
                stage === c.id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted hover:bg-surface-2",
              )}
            >
              {c.label}
            </button>
          ))}
          {reviewCount > 0 && (
            <button
              onClick={() => url.set({ integrity: integrityOnly ? null : "review" })}
              aria-pressed={integrityOnly}
              title="Attempts whose integrity report suggests a closer look. Evidence, not proof."
              className={cn(
                "inline-flex h-9 items-center gap-1 rounded-full border px-3 text-xs font-medium",
                integrityOnly ? "border-warning bg-warning/10 text-warning" : "border-warning/40 text-warning hover:bg-warning/5",
              )}
            >
              <AlertTriangle className="h-3.5 w-3.5" /> Review suggested ({reviewCount})
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search student, email or mock"
            aria-label="Search attempts"
            className="admin-input h-10 min-w-0 flex-1 basis-56"
          />
          <label className="flex items-center gap-1.5 text-xs text-muted">
            From
            <input type="date" value={from} onChange={(e) => url.set({ from: e.target.value || null })} className="admin-input h-10 w-auto" aria-label="From date" />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-muted">
            To
            <input type="date" value={to} onChange={(e) => url.set({ to: e.target.value || null })} className="admin-input h-10 w-auto" aria-label="To date" />
          </label>
          <select value={sort} onChange={(e) => url.set({ sort: e.target.value === "newest" ? null : e.target.value })} className="admin-input h-10 w-auto" aria-label="Sort">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="overall">Highest overall</option>
            <option value="name">Student name</option>
          </select>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted">
            {filtered.length} of {allCount} attempt{allCount === 1 ? "" : "s"}
            {(stage || integrityOnly || url.get("q") || from || to) && (
              <button className="ml-2 underline" onClick={() => { setQ(""); url.set({ stage: null, integrity: null, q: null, from: null, to: null }); }}>
                Clear filters
              </button>
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            {readyAll.length > 0 && (
              <Button
                className="h-10"
                disabled={busy}
                onClick={() => {
                  setSelected(new Set(chosen.length ? chosen.map((a) => a.id) : readyAll.map((a) => a.id)));
                  setConfirming(true);
                }}
              >
                <Send className="h-4 w-4" />
                {chosen.length ? `Release selected (${chosen.length})` : `Release all ready (${readyAll.length})`}
              </Button>
            )}
            <Button variant="outline" className="h-10" onClick={exportCsv} disabled={!filtered.length} title="Exports every attempt matching the filters, not just this page">
              <Download className="h-4 w-4" /> Export {filtered.length} (CSV)
            </Button>
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Inbox className="h-5 w-5" />}
          title="Nothing matches"
          desc="No attempt fits these filters."
          action={<Button variant="outline" onClick={() => { setQ(""); url.set({ stage: null, integrity: null, q: null, from: null, to: null }); }}>Clear filters</Button>}
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[48rem] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <th className="w-8 py-2">
                    {readyOnPage.length > 0 && (
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        aria-label="Select all ready on this page"
                        checked={readyOnPage.every((a) => selected.has(a.id))}
                        onChange={(e) =>
                          setSelected((s) => {
                            const n = new Set(s);
                            readyOnPage.forEach((a) => (e.target.checked ? n.add(a.id) : n.delete(a.id)));
                            return n;
                          })
                        }
                      />
                    )}
                  </th>
                  <th className="py-2 pr-3 font-medium">Student</th>
                  <th className="py-2 pr-3 font-medium">Mock</th>
                  <th className="py-2 pr-3 font-medium">Stage</th>
                  <th className="py-2 pr-2 text-center font-medium">L</th>
                  <th className="py-2 pr-2 text-center font-medium">R</th>
                  <th className="py-2 pr-2 text-center font-medium">W</th>
                  <th className="py-2 pr-3 text-center font-medium">Overall</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {pageRows.map((a) => (
                  <tr key={a.id} className="border-b border-border/60 last:border-0">
                    <td className="py-2">
                      {a.stage === "ready_to_release" && (
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          aria-label={`Select ${a.student_name || a.student_email}`}
                          checked={selected.has(a.id)}
                          onChange={() =>
                            setSelected((s) => {
                              const n = new Set(s);
                              if (n.has(a.id)) n.delete(a.id);
                              else n.add(a.id);
                              return n;
                            })
                          }
                        />
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <StudentCell a={a} onHistory={(email) => { setQ(email); url.set({ q: email, stage: null }); }} />
                    </td>
                    <td className="py-2 pr-3">{a.mock_title}</td>
                    <td className="py-2 pr-3"><StageCell a={a} /></td>
                    <td className="py-2 pr-2 text-center tabular-nums">{fmtBand(a.listening_band)}</td>
                    <td className="py-2 pr-2 text-center tabular-nums">{fmtBand(a.reading_band)}</td>
                    <td className="py-2 pr-2 text-center tabular-nums">{fmtBand(a.writing_band)}</td>
                    <td className="py-2 pr-3 text-center font-semibold tabular-nums">{fmtBand(a.overall_band)}</td>
                    <td className="py-2 text-right">
                      <RowAction a={a} back={back} busy={busy} run={run} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Phone cards */}
          <ul className="space-y-3 md:hidden">
            {pageRows.map((a) => (
              <li key={a.id} className="space-y-2 rounded-xl border border-border p-3">
                <div className="flex items-start justify-between gap-2">
                  <StudentCell a={a} onHistory={(email) => { setQ(email); url.set({ q: email, stage: null }); }} />
                  {a.stage === "ready_to_release" && (
                    <input
                      type="checkbox"
                      className="mt-1 h-5 w-5"
                      aria-label={`Select ${a.student_name || a.student_email}`}
                      checked={selected.has(a.id)}
                      onChange={() =>
                        setSelected((s) => {
                          const n = new Set(s);
                          if (n.has(a.id)) n.delete(a.id);
                          else n.add(a.id);
                          return n;
                        })
                      }
                    />
                  )}
                </div>
                <p className="text-sm">{a.mock_title}</p>
                <StageCell a={a} />
                <div className="grid grid-cols-4 gap-1 text-center text-xs">
                  {(
                    [
                      ["L", a.listening_band],
                      ["R", a.reading_band],
                      ["W", a.writing_band],
                      ["Overall", a.overall_band],
                    ] as const
                  ).map(([k, v]) => (
                    <div key={k} className="rounded-lg bg-surface-2 py-1.5">
                      <p className="text-muted">{k}</p>
                      <p className="text-sm font-semibold tabular-nums">{fmtBand(v)}</p>
                    </div>
                  ))}
                </div>
                <RowAction a={a} back={back} busy={busy} run={run} full />
              </li>
            ))}
          </ul>

          {pages > 1 && (
            <div className="flex items-center justify-between gap-2">
              <Button variant="outline" className="h-10" disabled={page <= 1} onClick={() => url.set({ page: String(page - 1) })}>
                <ChevronLeft className="h-4 w-4" /> Previous
              </Button>
              <span className="text-sm text-muted">Page {Math.min(page, pages)} of {pages}</span>
              <Button variant="outline" className="h-10" disabled={page >= pages} onClick={() => url.set({ page: String(page + 1) })}>
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}

      {confirming && (
        <ReleaseConfirm
          rows={filtered.filter((a) => selected.has(a.id) && a.stage === "ready_to_release")}
          sittingByMock={sittingByMock}
          busy={busy}
          onClose={() => setConfirming(false)}
          onConfirm={(ids) => {
            setConfirming(false);
            run(
              async () => {
                const res = await bulkReleaseMockAttempts(ids);
                if (!res.ok) return res;
                setSelected(new Set(res.outcome.skipped.map((s) => s.id)));
                if (res.outcome.skipped.length) {
                  const names = new Map(attempts.map((p) => [p.id, p.student_name || p.student_email || "A student"]));
                  onMsg({ ok: false, text: bulkText("released", res.outcome), details: res.outcome.skipped.map((s) => `${names.get(s.id)}: ${s.reason}`) });
                }
                return { ok: true as const, note: bulkText("released", res.outcome) };
              },
              (r) => (r.ok && r.note) || "Done.",
            );
          }}
        />
      )}
    </Card>
  );
}

function StudentCell({ a, onHistory }: { a: AdminAttemptSummary; onHistory: (email: string) => void }) {
  return (
    <div className="min-w-0">
      <p className="font-medium">{a.student_name || a.student_email || "Student"}</p>
      <p className="break-all text-xs text-muted">
        {a.student_email}
        {!a.user_id && " · account deleted"}
      </p>
      {a.student_email && (
        <button className="text-xs text-primary hover:underline" onClick={() => onHistory(a.student_email!)}>
          All this student&apos;s mocks
        </button>
      )}
    </div>
  );
}

function StageCell({ a }: { a: AdminAttemptSummary }) {
  const when =
    a.stage === "released" ? a.released_at
    : a.stage === "needs_grading" || a.stage === "ready_to_release" ? a.submitted_at
    : a.stage === "writing" ? (a.writing_saved_at ?? a.writing_started_at ?? a.reading_submitted_at)
    : a.stage === "reading" ? a.listening_submitted_at
    : a.stage === "listening" ? a.started_at
    : a.approved_at;
  const verb =
    a.stage === "released" ? "released" :
    a.stage === "needs_grading" || a.stage === "ready_to_release" ? "submitted" :
    a.stage === "writing" && a.writing_saved_at ? "last saved" :
    a.stage === "not_started" ? "approved" : "since";
  return (
    <div>
      <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium", stageTone[a.stage])}>{STAGE_LABEL[a.stage]}</span>
      {a.integrity.level === "review" && (
        <span
          title={a.integrity.reasons.join(" · ")}
          className="ml-1 inline-flex items-center gap-0.5 rounded bg-warning/10 px-1.5 py-0.5 text-xs font-medium text-warning"
        >
          <AlertTriangle className="h-3 w-3" /> Review
        </span>
      )}
      <p className="mt-0.5 text-xs text-muted" title={when ? timeAgo(when) : undefined}>
        {verb} {tashkent(when)}
      </p>
    </div>
  );
}

function RowAction({
  a,
  back,
  busy,
  run,
  full = false,
}: {
  a: AdminAttemptSummary;
  back: string;
  busy: boolean;
  run: ReturnType<typeof useRunner>["run"];
  full?: boolean;
}) {
  const href = `/admin/mocks/attempts/${a.id}?back=${back}`;
  const cls = cn(
    "inline-flex h-10 items-center justify-center gap-1 rounded-lg px-3 text-sm font-medium",
    full && "w-full",
  );
  if (a.stage === "not_started") {
    return (
      <Button
        variant="ghost"
        className={cls}
        disabled={busy}
        onClick={() => {
          if (!confirm(`Withdraw ${a.student_name || a.student_email}'s unused place?`)) return;
          run(() => cancelMockAttempt(a.id), "Place withdrawn.");
        }}
      >
        <Trash2 className="h-4 w-4" /> Withdraw
      </Button>
    );
  }
  if (a.stage === "needs_grading") {
    return <Link href={href} className={cn(cls, "bg-primary text-primary-foreground")}><Pencil className="h-4 w-4" /> Grade writing</Link>;
  }
  if (a.stage === "ready_to_release") {
    return <Link href={href} className={cn(cls, "border border-primary/40 text-primary hover:bg-primary/5")}><Eye className="h-4 w-4" /> Review &amp; release</Link>;
  }
  return (
    <Link href={href} className={cn(cls, "text-primary hover:underline")}>
      {a.stage === "released" ? "View result" : "Open"} <ChevronRight className="h-4 w-4" />
    </Link>
  );
}

function ReleaseConfirm({
  rows,
  sittingByMock,
  busy,
  onClose,
  onConfirm,
}: {
  rows: AdminAttemptSummary[];
  sittingByMock: Map<string, number>;
  busy: boolean;
  onClose: () => void;
  onConfirm: (ids: string[]) => void;
}) {
  const byMock = Object.entries(rows.reduce<Record<string, number>>((acc, r) => ((acc[r.mock_title] = (acc[r.mock_title] ?? 0) + 1), acc), {}));
  const stillSitting = byMock.map(([title]) => [title, sittingByMock.get(title) ?? 0] as const).filter(([, n]) => n > 0);
  return (
    <Modal title={`Release ${rows.length} result${rows.length === 1 ? "" : "s"}?`} onClose={onClose}>
      <ul className="space-y-1 text-sm">
        {byMock.map(([title, n]) => (
          <li key={title}><span className="font-medium">{n}</span> for {title}</li>
        ))}
      </ul>
      <div className="mt-3 max-h-48 overflow-y-auto rounded-lg border border-border">
        <table className="w-full text-xs">
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border/60 last:border-0">
                <td className="px-2 py-1">{r.student_name || r.student_email}</td>
                <td className="px-2 py-1 text-right tabular-nums">
                  L {fmtBand(r.listening_band)} · R {fmtBand(r.reading_band)} · W {fmtBand(r.writing_band)} · <b>{fmtBand(r.overall_band)}</b>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {stillSitting.length > 0 && (
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-xs">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
          <span>
            {stillSitting.map(([t, n]) => `${n} student${n === 1 ? " is" : "s are"} still sitting ${t}`).join("; ")}. Released students see
            their bands now, but the question-by-question answers stay hidden until everyone has finished.
          </span>
        </p>
      )}
      <p className="mt-2 text-xs text-muted">Each student is notified and sees these bands immediately. The server re-checks each one; anything not ready is skipped.</p>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button disabled={busy || !rows.length} onClick={() => onConfirm(rows.map((r) => r.id))}>
          <Send className="h-4 w-4" /> Release {rows.length}
        </Button>
      </div>
    </Modal>
  );
}

// --------------------------------------------------------------------- mocks

function Mocks({
  mocks,
  papers,
  images,
  onMsg,
  onDirty,
  openResults,
}: {
  mocks: AdminMock[];
  papers: MockPaper[];
  images: Record<string, string>;
  onMsg: (m: Msg) => void;
  onDirty: (dirty: boolean) => void;
  openResults: (mockId: string) => void;
}) {
  const [editing, setEditing] = useState<string | "new" | null>(mocks.length ? null : "new");
  const { busy, run } = useRunner(onMsg);

  function close() {
    onDirty(false);
    setEditing(null);
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-1 text-sm text-muted">
        <p>
          <span className="font-medium text-foreground">Papers:</span> upload Listening and Reading HTML on{" "}
          <Link href="/admin/tests" className="underline">Manage tests</Link> with <span className="font-medium">For</span> = “Mock exam only”.
          They never appear in the public catalogue. {papers.length} mock paper{papers.length === 1 ? "" : "s"} uploaded
          {papers.some((p) => !p.hasKey) && <span className="text-danger"> — {papers.filter((p) => !p.hasKey).length} without an answer key</span>}.
        </p>
      </Card>

      {editing === "new" ? (
        <MockForm papers={papers} onMsg={onMsg} onDirty={onDirty} onSaved={(id) => setEditing(id)} onClose={close} />
      ) : (
        <Button className="h-10" onClick={() => setEditing("new")} disabled={editing !== null}>
          <Plus className="h-4 w-4" /> New mock
        </Button>
      )}

      {/* Just created: the new row arrives with the refresh a moment later. Hold
          its place so the editor does not blink out and back. */}
      {editing && editing !== "new" && !mocks.some((m) => m.id === editing) && (
        <Card className="flex items-center gap-2 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Opening the saved mock…
        </Card>
      )}

      {mocks.length === 0 && editing !== "new" && !editing && (
        <EmptyState icon={<Plus className="h-5 w-5" />} title="No mocks yet" desc="Create your first mock." action={<Button onClick={() => setEditing("new")}>Create a mock</Button>} />
      )}

      {mocks.map((m) =>
        editing === m.id ? (
          <MockForm key={m.id} mock={m} image={images[m.id] ?? null} papers={papers} onMsg={onMsg} onDirty={onDirty} onSaved={() => {}} onClose={close} />
        ) : (
          <Card key={m.id} className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  {m.title}
                  <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium", m.published ? "bg-success/10 text-success" : m.issues.length ? "bg-warning/10 text-warning" : "bg-surface-2 text-muted")}>
                    {m.published ? "Published" : m.issues.length ? `Incomplete (${m.issues.length})` : "Ready, unpublished"}
                  </span>
                  {m.locked && (
                    <span className="inline-flex items-center gap-1 rounded bg-surface-2 px-1.5 py-0.5 text-xs text-muted" title="Students have places, so exam content is locked">
                      <Lock className="h-3 w-3" /> Locked
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted">Listening: {m.listening_title ?? "—"} · Reading: {m.reading_title ?? "—"}</p>
                <p className="text-xs text-muted">Times: L {m.listening_minutes} · R {m.reading_minutes} · W {m.writing_minutes} min{m.writing_task1_image_path ? " · Task 1 image" : ""}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className="h-10" disabled={busy || editing !== null} onClick={() => setEditing(m.id)}>
                  <Pencil className="h-4 w-4" /> Edit
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-10"
                  disabled={busy}
                  onClick={() =>
                    run(
                      () => setMockPublishedAction(m.id, !m.published),
                      m.published
                        ? `${m.title} unpublished. Existing places and results are unaffected.`
                        : `${m.title} published — students can request it.`,
                    )
                  }
                >
                  {m.published ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  {m.published ? "Unpublish" : "Publish"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-10"
                  disabled={busy}
                  title="New draft with the same content"
                  onClick={() => run(() => duplicateMockAction(m.id), `Copied ${m.title} as a new draft.`)}
                >
                  <Copy className="h-4 w-4" /> Duplicate
                </Button>
                {!m.locked && (
                  <Button
                    size="sm"
                    variant="danger"
                    className="h-10"
                    disabled={busy}
                    aria-label={`Delete ${m.title}`}
                    onClick={() => {
                      if (!confirm(`Delete "${m.title}"? This cannot be undone.`)) return;
                      run(() => deleteMockDefinition(m.id), `Deleted ${m.title}.`);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            {!m.published && m.issues.length > 0 && (
              <ul className="list-disc space-y-0.5 rounded-lg bg-warning/5 py-2 pl-8 pr-3 text-xs text-warning">
                {m.issues.map((i) => <li key={i}>{i}</li>)}
              </ul>
            )}

            {/* Per-mock drill-down: each count opens that mock's results. */}
            <button onClick={() => openResults(m.id)} className="grid w-full grid-cols-3 gap-2 text-left sm:grid-cols-6" aria-label={`Open ${m.title} results`}>
              {(
                [
                  ["Requests", m.counts.pending],
                  ["Places", m.counts.total],
                  ["In progress", m.counts.listening + m.counts.reading + m.counts.writing],
                  ["To grade", m.counts.needs_grading],
                  ["To release", m.counts.ready_to_release],
                  ["Released", m.counts.released],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className={cn("rounded-lg px-2 py-1.5 hover:bg-surface-2", (k === "To grade" || k === "To release" || k === "Requests") && v > 0 ? "bg-primary/5" : "bg-surface-2/50")}>
                  <p className="text-lg font-bold tabular-nums">{v}</p>
                  <p className="text-xs text-muted">{k}</p>
                </div>
              ))}
            </button>
          </Card>
        ),
      )}
    </div>
  );
}

function MockForm({
  mock,
  image,
  papers,
  onMsg,
  onDirty,
  onSaved,
  onClose,
}: {
  mock?: AdminMock;
  image?: string | null;
  papers: MockPaper[];
  onMsg: (m: Msg) => void;
  onDirty: (dirty: boolean) => void;
  onSaved: (id: string) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const initial = useMemo(
    () => ({
      title: mock?.title ?? "",
      description: mock?.description ?? "",
      listening_test_id: mock?.listening_test_id ?? "",
      reading_test_id: mock?.reading_test_id ?? "",
      writing_task1_prompt: mock?.writing_task1_prompt ?? "",
      writing_task2_prompt: mock?.writing_task2_prompt ?? "",
      writing_minutes: mock?.writing_minutes ?? 60,
      listening_minutes: mock?.listening_minutes ?? 40,
      reading_minutes: mock?.reading_minutes ?? 60,
    }),
    [mock],
  );
  const [form, setForm] = useState(initial);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const locked = !!mock?.locked;

  useEffect(() => {
    onDirty(dirty);
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, onDirty]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const byId = new Map(papers.map((p) => [p.id, p]));
  const listening = papers.filter((p) => p.skill === "listening");
  const reading = papers.filter((p) => p.skill === "reading");

  // Live checklist; the server re-validates with the same rules on save/publish.
  const checks = [
    { ok: !!form.title.trim(), label: "Title" },
    { ok: !!byId.get(form.listening_test_id)?.hasKey, label: "Listening paper with an answer key" },
    { ok: !!byId.get(form.reading_test_id)?.hasKey, label: "Reading paper with an answer key" },
    { ok: !!form.writing_task1_prompt.trim(), label: "Writing Task 1 prompt" },
    { ok: !!form.writing_task2_prompt.trim(), label: "Writing Task 2 prompt" },
    {
      ok: [form.listening_minutes, form.reading_minutes, form.writing_minutes].every((m) => m >= 10 && m <= 180),
      label: "Section times 10–180 min",
    },
  ];
  const ready = checks.every((c) => c.ok);

  function save(publish: boolean | null) {
    startTransition(async () => {
      try {
        const res = await saveMockDefinition({
          id: mock?.id,
          title: form.title,
          description: form.description || null,
          listening_test_id: form.listening_test_id || null,
          reading_test_id: form.reading_test_id || null,
          writing_task1_prompt: form.writing_task1_prompt,
          writing_task2_prompt: form.writing_task2_prompt,
          writing_minutes: Number(form.writing_minutes),
          listening_minutes: Number(form.listening_minutes),
          reading_minutes: Number(form.reading_minutes),
          published: publish ?? mock?.published ?? false,
        });
        if (!res.ok) {
          onMsg({ ok: false, text: res.error, details: res.issues });
          return;
        }
        onDirty(false);
        onMsg({
          ok: true,
          text: publish ? `${form.title} saved and published.` : mock ? `Saved ${form.title}.` : `Created ${form.title} as a draft. Add the Task 1 image below if it needs one.`,
        });
        router.refresh();
        // A new mock stays open (now as an edit) so the image can be uploaded straight away.
        if (!mock) onSaved(res.id);
        else onClose();
      } catch {
        onMsg({ ok: false, text: "Couldn't reach the server. Your edits are still here — try again." });
      }
    });
  }

  return (
    <Card className="space-y-4 border-primary/30">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">{mock ? `Edit ${mock.title}` : "New mock"}</h2>
        {dirty && <span className="text-xs text-warning">Unsaved changes</span>}
      </div>

      {locked && (
        <p className="flex items-start gap-2 rounded-lg border border-border bg-surface-2 p-3 text-sm">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          Students have places on this mock, so its papers, prompts, writing time and image are locked — changing them would alter an exam already under way or rewrite old results. Title and description can still change. Use <b>Duplicate</b> to make a changed version.
        </p>
      )}

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Title</span>
        <input className="admin-input h-10" value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Mock 1 — September" />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Description (optional)</span>
        <input className="admin-input h-10" value={form.description} onChange={(e) => set("description", e.target.value)} />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        {(
          [
            ["listening_test_id", "Listening paper", listening],
            ["reading_test_id", "Reading paper", reading],
          ] as const
        ).map(([key, label, list]) => (
          <label key={key} className="block space-y-1.5">
            <span className="text-sm font-medium">{label}</span>
            <select className="admin-input h-10" value={form[key]} disabled={locked} onChange={(e) => set(key, e.target.value)}>
              <option value="">{list.length ? "Choose…" : "No mock papers uploaded"}</option>
              {list.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                  {p.hasKey ? "" : " — NO ANSWER KEY"}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Writing Task 1 prompt</span>
        <textarea
          className="admin-input min-h-28 py-2"
          disabled={locked}
          value={form.writing_task1_prompt}
          onChange={(e) => set("writing_task1_prompt", e.target.value)}
          placeholder="The chart below shows… Summarise the information by selecting and reporting the main features, and make comparisons where relevant."
        />
      </label>

      <div className="space-y-2 rounded-lg border border-border p-3">
        <p className="flex items-center gap-2 text-sm font-medium">
          <ImageIcon className="h-4 w-4" /> Task 1 image
        </p>
        {image && (
          <a href={image} target="_blank" rel="noreferrer" title="Open full size">
            {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from private storage */}
            <img src={image} alt="Current Task 1 image" className="max-h-56 max-w-full rounded-lg border border-border bg-white" />
          </a>
        )}
        {!mock ? (
          <p className="text-xs text-muted">Save the draft first; the editor stays open so you can add the image.</p>
        ) : locked ? (
          <p className="text-xs text-muted">{image ? "Locked." : "No image. Locked."}</p>
        ) : (
          <ImageControls mockId={mock.id} hasImage={!!mock.writing_task1_image_path} onMsg={onMsg} />
        )}
      </div>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Writing Task 2 prompt</span>
        <textarea
          className="admin-input min-h-28 py-2"
          disabled={locked}
          value={form.writing_task2_prompt}
          onChange={(e) => set("writing_task2_prompt", e.target.value)}
          placeholder="Some people believe… To what extent do you agree or disagree?"
        />
      </label>

      {/* Server-enforced section clocks (0052). Listening should cover the recording plus transfer time. */}
      <div className="flex flex-wrap gap-4">
        {(
          [
            ["listening_minutes", "Listening time (min)"],
            ["reading_minutes", "Reading time (min)"],
            ["writing_minutes", "Writing time (min)"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="block space-y-1.5">
            <span className="text-sm font-medium">{label}</span>
            <input
              type="number"
              min={10}
              max={180}
              disabled={locked}
              className="admin-input h-10 w-28"
              value={form[key]}
              onChange={(e) => set(key, Number(e.target.value))}
            />
          </label>
        ))}
      </div>

      <div className="rounded-lg bg-surface-2 p-3">
        <p className="mb-1.5 text-sm font-medium">{ready ? "Ready to publish" : "Before publishing"}</p>
        <ul className="grid gap-1 text-xs sm:grid-cols-2">
          {checks.map((c) => (
            <li key={c.label} className={cn("flex items-center gap-1.5", c.ok ? "text-success" : "text-muted")}>
              {c.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5 text-warning" />} {c.label}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="outline"
          className="h-10"
          onClick={() => {
            if (dirty && !confirm("Discard your unsaved changes?")) return;
            onClose();
          }}
          disabled={pending}
        >
          {mock ? "Close" : "Cancel"}
        </Button>
        <Button variant="outline" className="h-10" onClick={() => save(mock?.published ? true : false)} disabled={pending || !form.title.trim()}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {mock?.published ? "Save" : "Save draft"}
        </Button>
        {!mock?.published && (
          <Button className="h-10" onClick={() => save(true)} disabled={pending || !ready} title={ready ? undefined : "Complete the checklist first"}>
            <Eye className="h-4 w-4" /> Save &amp; publish
          </Button>
        )}
      </div>
    </Card>
  );
}

function ImageControls({ mockId, hasImage, onMsg }: { mockId: string; hasImage: boolean; onMsg: (m: Msg) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        fd.set("mockId", mockId);
        start(async () => {
          try {
            const res = await uploadMockTask1Image(fd);
            onMsg(res.ok ? { ok: true, text: hasImage ? "Task 1 image replaced." : "Task 1 image uploaded." } : { ok: false, text: res.error });
            if (res.ok) router.refresh();
          } catch {
            onMsg({ ok: false, text: "Upload failed — check your connection and try again." });
          }
        });
      }}
    >
      <input type="file" name="file" accept="image/*" required aria-label="Task 1 image file" className="text-sm" />
      <Button size="sm" type="submit" className="h-10" disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} {hasImage ? "Replace" : "Upload"}
      </Button>
      {hasImage && (
        <Button
          size="sm"
          variant="outline"
          type="button"
          className="h-10"
          disabled={pending}
          onClick={() =>
            start(async () => {
              if (!confirm("Remove the Task 1 image from this mock?")) return;
              const res = await removeMockTask1Image(mockId);
              onMsg(res.ok ? { ok: true, text: "Image removed." } : { ok: false, text: res.error });
              if (res.ok) router.refresh();
            })
          }
        >
          Remove
        </Button>
      )}
    </form>
  );
}

// ---------------------------------------------------------------------- misc

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-elevated">
        <button onClick={onClose} aria-label="Close" className="absolute right-3 top-3 rounded-lg p-1.5 text-muted hover:bg-surface-2">
          <X className="h-4 w-4" />
        </button>
        <h2 className="mb-3 pr-6 font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  );
}

