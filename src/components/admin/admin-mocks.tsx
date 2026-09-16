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
  FileDown,
  ImageIcon,
  Inbox,
  Loader2,
  Lock,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Square,
  Trash2,
  Upload,
  Video,
  X,
} from "lucide-react";
import {
  approveMockRequest,
  bulkApproveMockRequests,
  bulkReleaseMockAttempts,
  cancelMockAttempt,
  closeMockSessionAction,
  deleteMockDefinition,
  duplicateMockAction,
  grantMockByEmail,
  recordMockSelfTestAction,
  rejectMockRequest,
  removeMockTask1Image,
  reprofileMockPaperAction,
  saveMockDefinition,
  setMockPaperMinutesAction,
  setMockPublishedAction,
  setMockVideoAction,
  startMockSessionAction,
  uploadMockPaperAction,
  uploadMockTask1Image,
} from "@/app/actions/mock";
import type { AdminAttemptSummary, AdminMock, AdminRequest, MockPaper } from "@/lib/mock-admin";
import { WritingPrompt } from "@/components/mock/writing-prompt";
import { parseTask1, parseTask2, spendLine, wordsLine } from "@/lib/ielts/writing-prompt";
import {
  SECTION_ORDER,
  SESSION_LABEL,
  STAGE_GROUPS,
  STAGE_LABEL,
  csvCell,
  tashkent,
  type AdminStage,
  type MockSection,
  type StageGroup,
} from "@/lib/mock-shared";
import { runPaperSelfTest } from "@/components/admin/paper-self-test";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn, timeAgo } from "@/lib/utils";

// ------------------------------------------------------------------- shared

type Msg = { ok: boolean; text: string; details?: string[] } | null;
type Videos = Partial<Record<MockSection, { url: string; duration: number }>>;
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
  videos,
  isOwner,
}: {
  pending: AdminRequest[];
  decisions: AdminRequest[];
  mocks: AdminMock[];
  papers: MockPaper[];
  attempts: AdminAttemptSummary[];
  images: Record<string, string>;
  videos: Videos;
  /** Deleting a mock destroys students' records, so it is the owner's alone. */
  isOwner: boolean;
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
          videos={videos}
          onMsg={setMsg}
          onDirty={(d) => (dirtyRef.current = d)}
          isOwner={isOwner}
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
  // The full-report export is per mock, so it needs one in scope (the Mock picker above).
  const scopedMockId = url.get("mock");
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
    const header = ["student", "email", "mock", "stage", "listening", "reading", "writing", "overall", "approved", "submitted", "released", "integrity", "integrity_reasons", "writing_violations", "writing_auto_submitted"];
    const lines = filtered.map((a) =>
      [a.student_name, a.student_email, a.mock_title, STAGE_LABEL[a.stage], a.listening_band, a.reading_band, a.writing_band, a.overall_band, a.approved_at, a.submitted_at, a.released_at, a.integrity.level, a.integrity.reasons.join("; "), a.writing_violations, a.writing_auto_submitted ? "yes" : "no"]
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
            {/* Full reports for one mock — needs a mock in scope, since the file is per mock. */}
            {scopedMockId && (
              <>
                {(["pdf", "docx"] as const).map((f) => (
                  <a
                    key={f}
                    href={`/api/mock-report?mock=${scopedMockId}&format=${f}`}
                    className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface-2"
                    title="Every attempt of this mock, with bands, essays and answers"
                  >
                    <FileDown className="h-4 w-4" /> All reports ({f === "pdf" ? "PDF" : "Word"})
                  </a>
                ))}
              </>
            )}
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
      {a.writing_auto_submitted && (
        <span
          title="Writing handed in automatically after 3 violations"
          className="ml-1 inline-flex items-center gap-0.5 rounded bg-danger/10 px-1.5 py-0.5 text-xs font-medium text-danger"
        >
          <AlertTriangle className="h-3 w-3" /> Auto-submitted
        </span>
      )}
      {a.integrity.level === "review" && !a.writing_auto_submitted && (
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
            {stillSitting.map(([t, n]) => `${n} student${n === 1 ? " is" : "s are"} still sitting ${t}`).join("; ")}. A released student
            sees their bands, the answers AND the papers straight away, so they could pass them on to whoever is still sitting.
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
  videos,
  onMsg,
  onDirty,
  isOwner,
  openResults,
}: {
  mocks: AdminMock[];
  papers: MockPaper[];
  images: Record<string, string>;
  videos: Videos;
  onMsg: (m: Msg) => void;
  onDirty: (dirty: boolean) => void;
  isOwner: boolean;
  openResults: (mockId: string) => void;
}) {
  const [editing, setEditing] = useState<string | "new" | null>(mocks.length ? null : "new");
  const { busy, run } = useRunner(onMsg);
  const [deleting, setDeleting] = useState<AdminMock | null>(null);

  function close() {
    onDirty(false);
    setEditing(null);
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-1 text-sm text-muted">
        <p>
          <span className="font-medium text-foreground">How a mock runs:</span> build it (upload the Listening and Reading HTML right in
          the form — each paper is parsed and live-checked), approve places, then click <b>Start session</b>. Nobody can start
          before that. <b>End session</b> stops new starts; students already inside finish. {papers.length} mock paper
          {papers.length === 1 ? "" : "s"} on file.
        </p>
      </Card>

      <InstructionVideos videos={videos} onMsg={onMsg} />

      {editing === "new" ? (
        <MockForm papers={papers} videos={videos} onMsg={onMsg} onDirty={onDirty} onSaved={(id) => setEditing(id)} onClose={close} />
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
          <MockForm key={m.id} mock={m} image={images[m.id] ?? null} papers={papers} videos={videos} onMsg={onMsg} onDirty={onDirty} onSaved={() => {}} onClose={close} />
        ) : (
          <Card key={m.id} className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  {m.title}
                  <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium", m.published ? "bg-success/10 text-success" : m.issues.length ? "bg-warning/10 text-warning" : "bg-surface-2 text-muted")}>
                    {m.published ? "Published" : m.issues.length ? `Incomplete (${m.issues.length})` : "Ready, unpublished"}
                  </span>
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-xs font-medium",
                      m.session_state === "running" ? "bg-primary/10 text-primary" : m.session_state === "closed" ? "bg-surface-2 text-muted" : "bg-warning/10 text-warning",
                    )}
                  >
                    {SESSION_LABEL[m.session_state]}
                  </span>
                  {m.locked && (
                    <span className="inline-flex items-center gap-1 rounded bg-surface-2 px-1.5 py-0.5 text-xs text-muted" title="The session has started, so exam content is locked">
                      <Lock className="h-3 w-3" /> Locked
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted">Listening: {m.listening_title ?? "—"} · Reading: {m.reading_title ?? "—"}</p>
                <p className="text-xs text-muted">Times: L {m.listening_minutes} · R {m.reading_minutes} · W {m.writing_minutes} min{m.writing_task1_image_path ? " · Task 1 image" : ""}</p>
                {m.session_started_at && (
                  <p className="text-xs text-muted">
                    Started {tashkent(m.session_started_at)}
                    {m.session_closed_at && m.session_state === "closed" ? ` · ended ${tashkent(m.session_closed_at)}` : ""}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {m.session_state === "waiting" && (
                  <Button
                    size="sm"
                    className="h-10"
                    disabled={busy || m.issues.length > 0}
                    title={m.issues.length ? "Fix the checklist below first" : "Admit every approved student"}
                    onClick={() => {
                      if (
                        !confirm(
                          `Start the session for "${m.title}"?\n\n${m.counts.total} approved student${m.counts.total === 1 ? "" : "s"} can start straight away (they are notified). Late approvals can start too, until you end the session.\n\nPapers, prompts and times lock.`,
                        )
                      )
                        return;
                      run(() => startMockSessionAction(m.id), `${m.title}: session started.`);
                    }}
                  >
                    <Play className="h-4 w-4" /> Start session
                  </Button>
                )}
                {m.session_state === "running" && (
                  <Button
                    size="sm"
                    variant="danger"
                    className="h-10"
                    disabled={busy}
                    onClick={() => {
                      if (
                        !confirm(
                          `End the session for "${m.title}"?\n\nStudents who haven't started can no longer start. Students in the middle of the mock finish normally.`,
                        )
                      )
                        return;
                      run(() => closeMockSessionAction(m.id), `${m.title}: session ended.`);
                    }}
                  >
                    <Square className="h-4 w-4" /> End session
                  </Button>
                )}
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
                {isOwner && (
                  <Button
                    size="sm"
                    variant="danger"
                    className="h-10"
                    disabled={busy}
                    aria-label={`Delete ${m.title}`}
                    title={m.counts.total ? "Deletes the mock and every attempt on it" : "Deletes this mock"}
                    onClick={() => setDeleting(m)}
                  >
                    <Trash2 className="h-4 w-4" /> Delete
                  </Button>
                )}
              </div>
            </div>

            {m.session_state === "waiting" && m.issues.length > 0 && (
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

      {deleting && (
        <DeleteMockDialog
          mock={deleting}
          busy={busy}
          onClose={() => setDeleting(null)}
          onConfirm={(title) => {
            const label = deleting.title;
            setDeleting(null);
            run(() => deleteMockDefinition(deleting.id, title), `Deleted ${label}.`);
          }}
        />
      )}
    </div>
  );
}

/**
 * Deleting a mock takes its students' records with it, so the owner types the
 * title first — the server checks the same title before it removes anything.
 */
function DeleteMockDialog({
  mock,
  busy,
  onClose,
  onConfirm,
}: {
  mock: AdminMock;
  busy: boolean;
  onClose: () => void;
  onConfirm: (title: string) => void;
}) {
  const [typed, setTyped] = useState("");
  const c = mock.counts;
  const matches = typed.trim() === mock.title.trim();
  return (
    <Modal title={`Delete ${mock.title}?`} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <p className="flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/5 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          <span>
            This deletes the mock and <b>{c.total} place{c.total === 1 ? "" : "s"}</b> on it
            {c.released > 0 && <> — including {c.released} released result{c.released === 1 ? "" : "s"}</>}: bands,
            essays, answers and integrity reports. It cannot be undone.
            {mock.session_state === "running" && <> The session is running, so anyone sitting it now loses their work.</>}
          </span>
        </p>
        <p className="text-muted">
          To confirm, type the title: <b className="text-foreground">{mock.title}</b>
        </p>
        <input
          className="admin-input h-10"
          value={typed}
          autoFocus
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && matches && !busy) onConfirm(typed);
          }}
          aria-label="Type the mock title to confirm"
          placeholder={mock.title}
        />
        <p className="text-xs text-muted">
          Keeping the records? Use <b>Unpublish</b> instead — students can no longer request it, and nothing is lost.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Keep it
          </Button>
          <Button variant="danger" disabled={!matches || busy} onClick={() => onConfirm(typed)}>
            <Trash2 className="h-4 w-4" /> Delete permanently
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function MockForm({
  mock,
  image,
  papers: serverPapers,
  videos,
  onMsg,
  onDirty,
  onSaved,
  onClose,
}: {
  mock?: AdminMock;
  image?: string | null;
  papers: MockPaper[];
  videos: Videos;
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
  // Set by the picture box ahead of the refresh that brings the new path from the server.
  const [hasLocalImage, setHasLocalImage] = useState<boolean | null>(null);

  useEffect(() => {
    onDirty(dirty);
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, onDirty]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  // Papers uploaded or re-checked in this form, ahead of the refresh that brings them from the server.
  const [touched, setTouched] = useState<Record<string, MockPaper>>({});
  const papers = useMemo(() => {
    const map = new Map(serverPapers.map((p) => [p.id, p]));
    for (const p of Object.values(touched)) map.set(p.id, p);
    return [...map.values()].sort((a, b) => a.title.localeCompare(b.title));
  }, [serverPapers, touched]);
  const updatePaper = (p: MockPaper) => setTouched((t) => ({ ...t, [p.id]: p }));
  const byId = new Map(papers.map((p) => [p.id, p]));
  const listening = papers.filter((p) => p.skill === "listening");
  const reading = papers.filter((p) => p.skill === "reading");
  const paperReady = (id: string) => {
    const p = byId.get(id);
    return !!p?.hasKey && !!p.profile?.ok && !!p.selftest?.passed && p.selftest.hash === p.profile.hash;
  };

  // Live checklist; the server re-validates with the same rules on save/publish/start.
  const checks = [
    { ok: !!form.title.trim(), label: "Title" },
    { ok: paperReady(form.listening_test_id), label: "Listening paper parsed + live check passed" },
    { ok: paperReady(form.reading_test_id), label: "Reading paper parsed + live check passed" },
    { ok: SECTION_ORDER.every((s) => !!videos[s]), label: "Three instruction videos" },
    { ok: !!form.writing_task1_prompt.trim(), label: "Writing Task 1 topic" },
    { ok: hasLocalImage ?? !!mock?.writing_task1_image_path, label: "Writing Task 1 picture" },
    { ok: !!form.writing_task2_prompt.trim(), label: "Writing Task 2 question" },
    {
      ok: [form.listening_minutes, form.reading_minutes, form.writing_minutes].every((m) => m >= 10 && m <= 180),
      label: "Section times 10–180 min",
    },
  ];
  const ready = checks.every((c) => c.ok);

  /**
   * A new mock has no id to hang the picture on: the picture box saves the draft
   * first (same action as Save draft), keeps the form open as an edit, then uploads.
   */
  async function ensureSaved(): Promise<string | null> {
    if (mock) return mock.id;
    if (!form.title.trim()) {
      onMsg({ ok: false, text: "Add a title first — the draft is saved before the picture is uploaded." });
      return null;
    }
    const res = await saveMockDefinition({
      title: form.title,
      description: form.description || null,
      listening_test_id: form.listening_test_id || null,
      reading_test_id: form.reading_test_id || null,
      writing_task1_prompt: form.writing_task1_prompt,
      writing_task2_prompt: form.writing_task2_prompt,
      writing_minutes: Number(form.writing_minutes),
      listening_minutes: Number(form.listening_minutes),
      reading_minutes: Number(form.reading_minutes),
      published: false,
    });
    if (!res.ok) {
      onMsg({ ok: false, text: res.error, details: res.issues });
      return null;
    }
    onDirty(false);
    onSaved(res.id);
    return res.id;
  }

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
          text: publish ? `${form.title} saved and published.` : mock ? `Saved ${form.title}.` : `Created ${form.title} as a draft. Add the Task 1 picture below.`,
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
          The session has started, so papers, prompts, times and the image are locked — changing them would alter an exam already under way or rewrite old results. Title and description can still change. Use <b>Duplicate</b> to make a changed version.
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

      <div className="grid gap-3 lg:grid-cols-2">
        <PaperSlot
          skill="listening"
          value={form.listening_test_id}
          papers={listening}
          minutes={form.listening_minutes}
          locked={locked}
          onChange={(id, mins) => setForm((f) => ({ ...f, listening_test_id: id, listening_minutes: mins ?? f.listening_minutes }))}
          onMinutes={(m) => set("listening_minutes", m)}
          onPaper={updatePaper}
          onMsg={onMsg}
        />
        <PaperSlot
          skill="reading"
          value={form.reading_test_id}
          papers={reading}
          minutes={form.reading_minutes}
          locked={locked}
          onChange={(id, mins) => setForm((f) => ({ ...f, reading_test_id: id, reading_minutes: mins ?? f.reading_minutes }))}
          onMinutes={(m) => set("reading_minutes", m)}
          onPaper={updatePaper}
          onMsg={onMsg}
        />
      </div>

      <WritingEditor
        mockId={mock?.id ?? null}
        locked={locked}
        task1={form.writing_task1_prompt}
        task2={form.writing_task2_prompt}
        onTask1={(v) => set("writing_task1_prompt", v)}
        onTask2={(v) => set("writing_task2_prompt", v)}
        imageUrl={image ?? null}
        hasImage={!!mock?.writing_task1_image_path}
        ensureSaved={ensureSaved}
        onImage={setHasLocalImage}
        onMsg={onMsg}
      />

      {/* Server-enforced section clock (0052). Listening and Reading times sit with their papers above. */}
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Writing time (min)</span>
        <input
          type="number"
          min={10}
          max={180}
          disabled={locked}
          className="admin-input h-10 w-28"
          value={form.writing_minutes}
          onChange={(e) => set("writing_minutes", Number(e.target.value))}
        />
      </label>

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

// ---------------------------------------------------------------- papers (0054)

function PaperSlot({
  skill,
  value,
  papers,
  minutes,
  locked,
  onChange,
  onMinutes,
  onPaper,
  onMsg,
}: {
  skill: "listening" | "reading";
  value: string;
  papers: MockPaper[];
  minutes: number;
  locked: boolean;
  onChange: (id: string, minutes: number | null) => void;
  onMinutes: (m: number) => void;
  onPaper: (p: MockPaper) => void;
  onMsg: (m: Msg) => void;
}) {
  const label = skill === "listening" ? "Listening" : "Reading";
  const paper = papers.find((p) => p.id === value) ?? null;
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const profile = paper?.profile ?? null;
  const st = paper?.selftest && profile && paper.selftest.hash === profile.hash ? paper.selftest : null;

  async function check(p: MockPaper) {
    if (!p.profile) return;
    setBusy("Starting the live check…");
    try {
      const checks = await runPaperSelfTest(p.id, p.profile, (step) => setBusy(step));
      const res = await recordMockSelfTestAction(p.id, checks);
      if (!res.ok) {
        onMsg({ ok: false, text: res.error });
        return;
      }
      onPaper(res.paper);
      onMsg(
        res.paper.selftest?.passed
          ? { ok: true, text: `${res.paper.title}: live check passed.` }
          : { ok: false, text: `${res.paper.title}: live check failed.`, details: checks.filter((c) => !c.ok).map((c) => `${c.label} — ${c.detail ?? ""}`) },
      );
    } catch {
      onMsg({ ok: false, text: "The live check couldn't run. Check your connection and try again." });
    } finally {
      setBusy(null);
    }
  }

  async function upload(file: File) {
    setBusy("Uploading and parsing…");
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("skill", skill);
      const res = await uploadMockPaperAction(fd);
      if (!res.ok) {
        onMsg({ ok: false, text: res.error });
        return;
      }
      onPaper(res.paper);
      onChange(res.paper.id, res.paper.defaultMinutes);
      if (res.paper.profile?.ok) await check(res.paper);
      else onMsg({ ok: false, text: `${res.paper.title}: parsing found problems.`, details: res.paper.profile?.errors });
    } catch {
      onMsg({ ok: false, text: "Upload failed — check your connection and try again." });
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function reparse(p: MockPaper) {
    setBusy("Parsing the paper…");
    try {
      const res = await reprofileMockPaperAction(p.id);
      if (!res.ok) {
        onMsg({ ok: false, text: res.error });
        return;
      }
      onPaper(res.paper);
      if (res.paper.profile?.ok) await check(res.paper);
      else onMsg({ ok: false, text: `${res.paper.title}: parsing found problems.`, details: res.paper.profile?.errors });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">{label} paper</span>
        {!locked && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept=".html,.htm,text/html"
              className="hidden"
              aria-label={`Upload ${label} HTML`}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
              }}
            />
            <Button size="sm" variant="outline" className="h-9" disabled={!!busy} onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4" /> Upload HTML
            </Button>
          </>
        )}
      </div>

      <select
        className="admin-input h-10"
        value={value}
        disabled={locked || !!busy}
        aria-label={`${label} paper`}
        onChange={(e) => {
          const next = papers.find((p) => p.id === e.target.value);
          onChange(e.target.value, next?.defaultMinutes ?? null);
        }}
      >
        <option value="">{papers.length ? "Choose an uploaded paper…" : "Upload a paper"}</option>
        {papers.map((p) => (
          <option key={p.id} value={p.id}>
            {p.title}
            {!p.hasKey ? " — NO ANSWER KEY" : p.selftest?.passed && p.profile && p.selftest.hash === p.profile.hash ? " ✓" : ""}
          </option>
        ))}
      </select>

      {busy && (
        <p className="flex items-center gap-2 text-xs text-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> {busy}
        </p>
      )}

      {paper && (
        <div className="space-y-1.5 rounded-md bg-surface-2/60 p-2 text-xs">
          {profile ? (
            <>
              <p className={cn("flex items-center gap-1.5 font-medium", profile.ok ? "text-success" : "text-danger")}>
                {profile.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                {profile.ok ? "Parsed" : "Parsing found problems"} · {profile.family ?? "unknown player"} · {profile.keyQuestions.length} questions
                {profile.parts.length ? ` · ${profile.parts.length} parts` : ""}
                {skill === "listening" ? ` · audio ${profile.audioReachable === false ? "unreachable" : profile.audioSrc ? "found" : "missing"}` : ""}
              </p>
              {profile.errors.map((e) => (
                <p key={e} className="text-danger">• {e}</p>
              ))}
              {profile.warnings.map((w) => (
                <p key={w} className="text-warning">• {w}</p>
              ))}
              {st ? (
                <div className="space-y-0.5 pt-1">
                  <p className={cn("flex items-center gap-1.5 font-medium", st.passed ? "text-success" : "text-danger")}>
                    <ShieldCheck className="h-3.5 w-3.5" /> Live check {st.passed ? "passed" : "failed"} · {tashkent(st.ranAt)}
                  </p>
                  {st.checks.map((c) => (
                    <p key={c.id} className={c.ok ? "text-muted" : "text-danger"}>
                      {c.ok ? "✓" : "✗"} {c.label}
                      {c.detail ? ` — ${c.detail}` : ""}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-warning">Live check not run for this file yet.</p>
              )}
              {!locked && profile.ok && (
                <Button size="sm" variant="outline" className="h-8" disabled={!!busy} onClick={() => void check(paper)}>
                  <ShieldCheck className="h-3.5 w-3.5" /> {st ? "Run the live check again" : "Check paper"}
                </Button>
              )}
            </>
          ) : (
            <>
              <p className="text-warning">Uploaded before papers were parsed.</p>
              {!locked && (
                <Button size="sm" variant="outline" className="h-8" disabled={!!busy} onClick={() => void reparse(paper)}>
                  <ShieldCheck className="h-3.5 w-3.5" /> Check paper
                </Button>
              )}
            </>
          )}
        </div>
      )}

      <label className="flex items-center gap-2 text-sm">
        <span className="font-medium">{label} time</span>
        <input
          type="number"
          min={10}
          max={180}
          disabled={locked}
          className="admin-input h-9 w-24"
          value={minutes}
          onChange={(e) => onMinutes(Number(e.target.value))}
          onBlur={(e) => {
            const m = Number(e.target.value);
            // Remember it as this paper's default for the next mock that uses it.
            if (paper && m >= 10 && m <= 180 && m !== paper.defaultMinutes) void setMockPaperMinutesAction(paper.id, m);
          }}
        />
        <span className="text-muted">min</span>
      </label>
    </div>
  );
}

// ------------------------------------------------------- instruction videos (0054)

function InstructionVideos({ videos, onMsg }: { videos: Videos; onMsg: (m: Msg) => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(!SECTION_ORDER.every((s) => videos[s]));
  const [editing, setEditing] = useState<MockSection | null>(null);
  const [url, setUrl] = useState("");
  const [pending, start] = useTransition();

  function save(section: MockSection) {
    const probe = document.createElement("video");
    probe.preload = "metadata";
    probe.muted = true;
    start(async () => {
      const duration = await new Promise<number>((resolve) => {
        const t = setTimeout(() => resolve(NaN), 15_000);
        probe.onloadedmetadata = () => {
          clearTimeout(t);
          resolve(probe.duration);
        };
        probe.onerror = () => {
          clearTimeout(t);
          resolve(NaN);
        };
        probe.src = url.trim();
      });
      const res = await setMockVideoAction(section, url, duration);
      if (!res.ok) {
        onMsg({ ok: false, text: res.error });
        return;
      }
      onMsg({ ok: true, text: `${section} instruction video updated. It plays from the next section a student opens.` });
      setEditing(null);
      setUrl("");
      router.refresh();
    });
  }

  return (
    <Card className="space-y-3">
      <button className="flex w-full items-center justify-between gap-2 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="flex items-center gap-2 font-semibold">
          <Video className="h-4 w-4" /> Instruction videos
          <span className="text-xs font-normal text-muted">
            {SECTION_ORDER.filter((s) => videos[s]).length}/3 set · played before every section, no skip
          </span>
        </span>
        {open ? <ChevronLeft className="h-4 w-4 -rotate-90" /> : <ChevronRight className="h-4 w-4 rotate-90" />}
      </button>
      {open && (
        <div className="grid gap-3 md:grid-cols-3">
          {SECTION_ORDER.map((s) => {
            const v = videos[s];
            return (
              <div key={s} className="space-y-2 rounded-lg border border-border p-2">
                <p className="text-sm font-medium capitalize">
                  {s}
                  {v ? <span className="ml-1 text-xs font-normal text-muted">· {Math.round(v.duration)} s</span> : <span className="ml-1 text-xs text-danger">not set</span>}
                </p>
                {v && (
                  <video src={v.url} controls preload="metadata" className="aspect-video w-full rounded bg-black" />
                )}
                {editing === s ? (
                  <div className="space-y-2">
                    <input className="admin-input h-9" placeholder="https://…/video.mp4" value={url} onChange={(e) => setUrl(e.target.value)} />
                    <div className="flex gap-2">
                      <Button size="sm" className="h-8" disabled={pending || !url.trim()} onClick={() => save(s)}>
                        {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save
                      </Button>
                      <Button size="sm" variant="outline" className="h-8" disabled={pending} onClick={() => setEditing(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button size="sm" variant="outline" className="h-8" onClick={() => { setEditing(s); setUrl(v?.url ?? ""); }}>
                    {v ? "Replace" : "Set video"}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// -------------------------------------------------------------- writing (v3)

/**
 * Writing v3: the owner types only the Task 1 topic sentence and the Task 2
 * question; the platform adds the Cambridge wording (writing-prompt.ts). The
 * picture goes in by drag & drop, click, or Ctrl+V while the form is open.
 * The preview is the student's own component, so what you see is what they see.
 */
function WritingEditor({
  mockId,
  locked,
  task1,
  task2,
  onTask1,
  onTask2,
  imageUrl,
  hasImage,
  ensureSaved,
  onImage,
  onMsg,
}: {
  mockId: string | null;
  locked: boolean;
  task1: string;
  task2: string;
  onTask1: (v: string) => void;
  onTask2: (v: string) => void;
  imageUrl: string | null;
  hasImage: boolean;
  ensureSaved: () => Promise<string | null>;
  onImage: (has: boolean) => void;
  onMsg: (m: Msg) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);
  const [askRemove, setAskRemove] = useState(false);
  const [preview, setPreview] = useState<1 | 2>(1);
  const fileRef = useRef<HTMLInputElement>(null);
  const shown = removed ? null : (localUrl ?? imageUrl);
  const p1 = parseTask1(task1);
  const p2 = parseTask2(task2);

  useEffect(
    () => () => {
      if (localUrl) URL.revokeObjectURL(localUrl);
    },
    [localUrl],
  );

  const upload = useCallback(
    async (file: File) => {
      if (locked || busy) return;
      if (!file.type.startsWith("image/")) {
        onMsg({ ok: false, text: "The Task 1 picture must be an image file (PNG or JPG)." });
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        onMsg({ ok: false, text: "Keep the picture under 5 MB." });
        return;
      }
      setBusy(true);
      try {
        const id = mockId ?? (await ensureSaved());
        if (!id) return;
        const fd = new FormData();
        fd.set("mockId", id);
        fd.set("file", file);
        const res = await uploadMockTask1Image(fd);
        if (!res.ok) {
          onMsg({ ok: false, text: res.error });
          return;
        }
        setRemoved(false);
        setLocalUrl(URL.createObjectURL(file));
        onImage(true);
        onMsg({
          ok: true,
          text: mockId ? (hasImage ? "Task 1 picture replaced." : "Task 1 picture uploaded.") : "Draft saved and Task 1 picture uploaded.",
        });
        router.refresh();
      } catch {
        onMsg({ ok: false, text: "Upload failed — check your connection and try again." });
      } finally {
        setBusy(false);
      }
    },
    [busy, ensureSaved, hasImage, locked, mockId, onImage, onMsg, router],
  );

  // Ctrl+V a screenshot while this form is open (text pastes are left alone).
  useEffect(() => {
    if (locked) return;
    const onPaste = (e: ClipboardEvent) => {
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
      if (!file) return;
      e.preventDefault();
      void upload(file);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [locked, upload]);

  async function remove() {
    if (!mockId) return;
    setBusy(true);
    try {
      const res = await removeMockTask1Image(mockId);
      onMsg(res.ok ? { ok: true, text: "Task 1 picture removed." } : { ok: false, text: res.error });
      if (res.ok) {
        setRemoved(true);
        setLocalUrl(null);
        onImage(false);
        router.refresh();
      }
    } catch {
      onMsg({ ok: false, text: "Couldn't reach the server — try again." });
    } finally {
      setBusy(false);
      setAskRemove(false);
    }
  }

  const warn = (list: string[]) =>
    list.length > 0 && (
      <span className="flex items-start gap-1.5 text-xs text-warning">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {list[0]}
      </span>
    );

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <div className="space-y-4">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Writing Task 1 topic</span>
          <span className="block text-xs text-muted">
            Type only the topic sentence. &ldquo;Summarise the information…&rdquo; and &ldquo;Write at least 150 words.&rdquo; are added for you.
          </span>
          <textarea
            className="admin-input min-h-20 py-2"
            disabled={locked}
            value={task1}
            onChange={(e) => onTask1(e.target.value)}
            placeholder="The diagram below shows the process of using water to produce electricity."
          />
          {task1.trim() && warn(p1.warnings)}
        </label>

        <div className="space-y-2">
          <p className="flex items-center gap-2 text-sm font-medium">
            <ImageIcon className="h-4 w-4" /> Task 1 picture <span className="text-xs font-normal text-muted">(required)</span>
          </p>
          <div
            role="button"
            tabIndex={locked ? -1 : 0}
            aria-disabled={locked}
            aria-label="Task 1 picture: drop, click or paste"
            onClick={() => !locked && !busy && fileRef.current?.click()}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === " ") && !locked && !busy) fileRef.current?.click();
            }}
            onDragOver={(e) => {
              if (locked) return;
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              const file = e.dataTransfer.files?.[0];
              if (file) void upload(file);
            }}
            className={cn(
              "flex min-h-32 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-3 text-center text-sm transition-colors",
              locked ? "cursor-not-allowed opacity-70" : "cursor-pointer hover:border-primary/60",
              over ? "border-primary bg-primary/5" : "border-border",
            )}
          >
            {busy ? (
              <Loader2 className="h-6 w-6 animate-spin text-muted" />
            ) : shown ? (
              // eslint-disable-next-line @next/next/no-img-element -- blob preview or short-lived signed URL
              <img src={shown} alt="Current Task 1 picture" className="max-h-56 max-w-full rounded border border-border bg-white" />
            ) : (
              <Upload className="h-6 w-6 text-muted" />
            )}
            <span className="text-xs text-muted">
              {locked
                ? shown
                  ? "Locked."
                  : "No picture. Locked."
                : shown
                  ? "Drop, click or Ctrl+V to replace"
                  : "Drop the picture here, click to choose, or paste it with Ctrl+V"}
            </span>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            aria-label="Task 1 picture file"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void upload(file);
            }}
          />
          {!locked && shown && mockId &&
            (askRemove ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span>Remove the Task 1 picture?</span>
                <Button size="sm" variant="outline" className="h-8" onClick={() => setAskRemove(false)} disabled={busy}>
                  Keep
                </Button>
                <Button size="sm" className="h-8" onClick={() => void remove()} disabled={busy}>
                  Remove
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="outline" className="h-8" onClick={() => setAskRemove(true)} disabled={busy}>
                <Trash2 className="h-4 w-4" /> Remove picture
              </Button>
            ))}
        </div>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Writing Task 2 question</span>
          <span className="block text-xs text-muted">
            Type only the question. The statement shows in bold with the question below it; a blank line forces where it splits.
          </span>
          <textarea
            className="admin-input min-h-24 py-2"
            disabled={locked}
            value={task2}
            onChange={(e) => onTask2(e.target.value)}
            placeholder="Fewer and fewer people today write by hand using a pen or pencil. What are the reasons for this? Is this a positive or a negative development?"
          />
          {task2.trim() && warn(p2.warnings)}
        </label>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Eye className="h-4 w-4" /> Student preview
          </p>
          <div className="flex gap-1">
            {([1, 2] as const).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setPreview(n)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium",
                  preview === n ? "bg-primary/10 text-primary" : "text-muted hover:bg-surface-2",
                )}
              >
                Part {n}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-hidden rounded-lg border border-border bg-white text-black" data-testid="writing-preview">
          <div className="border-b border-[#d5d5d5] bg-[#F1F2EC] px-4 py-2.5 text-sm" style={{ fontFamily: "Arial, sans-serif" }}>
            <p className="font-bold">Part {preview}</p>
            <p>
              {spendLine(preview)} {wordsLine(preview)}
            </p>
          </div>
          <div className="max-h-[32rem] overflow-y-auto p-4">
            <WritingPrompt task={preview} raw={preview === 1 ? task1 : task2} imageUrl={preview === 1 ? shown : null} />
          </div>
        </div>
      </div>
    </div>
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

