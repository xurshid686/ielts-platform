"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, Flag, Loader2, Tags } from "lucide-react";
import { RenameTestButton } from "@/components/admin/rename-test-button";
import { DeleteTestButton } from "@/components/admin/delete-test-button";
import { bulkSetTier, updateTestMeta, type TestMetaPatch } from "@/app/actions/admin-tests";
import { QUESTION_TYPES } from "@/lib/ielts/question-types";
import { EDITABLE_TRACKS } from "@/lib/admin/stats-shared";
import { cn } from "@/lib/utils";

export type TestTableRow = {
  id: string;
  title: string;
  skill: "reading" | "listening";
  kind: string | null;
  tier: string;
  track: string | null;
  passage: number | null;
  total: number | null;
  question_types: string[] | null;
  created_at: string;
  attempts: number;
  students: number;
  avg_band: number | null;
  avg_accuracy: number | null;
  open_reports: number;
};

const TRACK_LABEL: Record<string, string> = {
  regular: "Regular",
  pre_ielts: "Pre-IELTS",
  intro: "Intro",
  discipline: "Discipline",
  mock: "Mock",
};

const SORTS = [
  { id: "new", label: "Newest" },
  { id: "attempts", label: "Most taken" },
  { id: "band_low", label: "Lowest avg band" },
  { id: "reports", label: "Open reports" },
  { id: "title", label: "Title A–Z" },
] as const;
type Sort = (typeof SORTS)[number]["id"];

const PAGE = 100;

export function TestsTable({ tests }: { tests: TestTableRow[] }) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [q, setQ] = useState("");
  const [skill, setSkill] = useState<"all" | "reading" | "listening">("all");
  const [tier, setTier] = useState<"all" | "free" | "premium">("all");
  const [track, setTrack] = useState<string>("all");
  const [kind, setKind] = useState<string>("all");
  const [qtype, setQtype] = useState<string>("all");
  const [sort, setSort] = useState<Sort>("new");
  const [shown, setShown] = useState(PAGE);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [editingTypes, setEditingTypes] = useState<string | null>(null);

  const allTypes = useMemo(
    () => [...new Set([...QUESTION_TYPES.reading, ...QUESTION_TYPES.listening])].sort(),
    [],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = tests.filter(
      (t) =>
        (skill === "all" || t.skill === skill) &&
        (tier === "all" || t.tier === tier) &&
        (track === "all" || (t.track ?? "regular") === track) &&
        (kind === "all" || (t.kind ?? "single") === kind) &&
        (qtype === "all" || (t.question_types ?? []).includes(qtype)) &&
        (!needle || t.title.toLowerCase().includes(needle)),
    );
    const by: Record<Sort, (a: TestTableRow, b: TestTableRow) => number> = {
      new: (a, b) => b.created_at.localeCompare(a.created_at),
      attempts: (a, b) => b.attempts - a.attempts,
      band_low: (a, b) => (a.avg_band ?? 99) - (b.avg_band ?? 99),
      reports: (a, b) => b.open_reports - a.open_reports || b.attempts - a.attempts,
      title: (a, b) => a.title.localeCompare(b.title),
    };
    return out.sort(by[sort]);
  }, [tests, q, skill, tier, track, kind, qtype, sort]);

  // Resetting the page cap when a filter changes, done during render (the
  // test-browser.tsx pattern): the lint rejects setState inside an effect.
  const facetKey = [q, skill, tier, track, kind, qtype, sort].join("|");
  const [lastKey, setLastKey] = useState(facetKey);
  if (lastKey !== facetKey) {
    setLastKey(facetKey);
    setShown(PAGE);
  }

  const visible = filtered.slice(0, shown);
  const allVisibleSelected = visible.length > 0 && visible.every((t) => selected.has(t.id));

  async function save(id: string, patch: TestMetaPatch, label: string) {
    setBusy(id);
    setMsg(null);
    const r = await updateTestMeta(id, patch);
    setBusy(null);
    if (!r.ok) setMsg({ ok: false, text: r.error });
    else {
      setMsg({ ok: true, text: label });
      startRefresh(() => router.refresh());
    }
  }

  async function bulk(t: "free" | "premium") {
    const ids = [...selected];
    if (!window.confirm(`Make ${ids.length} selected ${ids.length === 1 ? "test" : "tests"} ${t}?`)) return;
    setBusy("bulk");
    setMsg(null);
    const r = await bulkSetTier(ids, t);
    setBusy(null);
    if (!r.ok) setMsg({ ok: false, text: r.error });
    else {
      setMsg({ ok: true, text: `${r.changed} ${r.changed === 1 ? "test is" : "tests are"} now ${t}. Discipline and mock papers were skipped.` });
      setSelected(new Set());
      startRefresh(() => router.refresh());
    }
  }

  const sel = "h-8 rounded-md border border-border bg-surface px-2 text-xs";

  return (
    <div className="space-y-3">
      {/* Filters, one row above the table */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search titles"
          aria-label="Search titles"
          className="h-8 w-56 rounded-md border border-border bg-surface px-2.5 text-[13px] outline-none focus:border-primary/60"
        />
        <select aria-label="Filter by skill" className={sel} value={skill} onChange={(e) => setSkill(e.target.value as typeof skill)}>
          <option value="all">All skills</option>
          <option value="reading">Reading</option>
          <option value="listening">Listening</option>
        </select>
        <select aria-label="Filter by tier" className={sel} value={tier} onChange={(e) => setTier(e.target.value as typeof tier)}>
          <option value="all">Free + Premium</option>
          <option value="free">Free</option>
          <option value="premium">Premium</option>
        </select>
        <select aria-label="Filter by track" className={sel} value={track} onChange={(e) => setTrack(e.target.value)}>
          <option value="all">All tracks</option>
          {Object.entries(TRACK_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <select aria-label="Filter by kind" className={sel} value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="all">Passages + full</option>
          <option value="single">Single passage / section</option>
          <option value="full">Full tests</option>
        </select>
        <select aria-label="Filter by question type" className={cn(sel, "max-w-52")} value={qtype} onChange={(e) => setQtype(e.target.value)}>
          <option value="all">Any question type</option>
          {allTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select aria-label="Sort tests" className={sel} value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          {SORTS.map((s) => (
            <option key={s.id} value={s.id}>
              Sort: {s.label}
            </option>
          ))}
        </select>
        <span className="ml-auto text-xs text-muted tabular-nums">
          {filtered.length} of {tests.length}
          {refreshing && <Loader2 className="ml-1 inline h-3 w-3 animate-spin" />}
        </span>
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-[13px]">
          <b className="tabular-nums">{selected.size}</b> selected
          <button disabled={!!busy} onClick={() => bulk("free")} className="rounded-md border border-border bg-surface px-2 py-1 text-xs font-medium hover:border-primary/40 disabled:opacity-50">
            Make free
          </button>
          <button disabled={!!busy} onClick={() => bulk("premium")} className="rounded-md border border-border bg-surface px-2 py-1 text-xs font-medium hover:border-premium/50 disabled:opacity-50">
            Make premium
          </button>
          {busy === "bulk" && <Loader2 className="h-4 w-4 animate-spin text-muted" />}
          <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-muted hover:underline">
            Clear selection
          </button>
        </div>
      )}

      {msg && (
        <p role="status" className={cn("rounded-md px-3 py-2 text-xs", msg.ok ? "bg-success/10 text-success" : "bg-danger/10 text-danger")}>
          {msg.text}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-[13px]">
          <thead className="bg-surface text-xs text-muted">
            <tr className="border-b border-border">
              <th className="w-8 px-3 py-2">
                <input
                  type="checkbox"
                  aria-label="Select all shown"
                  checked={allVisibleSelected}
                  onChange={(e) => {
                    const next = new Set(selected);
                    for (const t of visible) {
                      if (e.target.checked) next.add(t.id);
                      else next.delete(t.id);
                    }
                    setSelected(next);
                  }}
                />
              </th>
              <th className="px-3 py-2 text-left font-medium">Test</th>
              <th className="px-3 py-2 text-left font-medium">Tier</th>
              <th className="px-3 py-2 text-left font-medium">Track</th>
              <th className="px-3 py-2 text-right font-medium">Qs</th>
              <th className="px-3 py-2 text-right font-medium">Attempts</th>
              <th className="px-3 py-2 text-right font-medium">Avg band</th>
              <th className="px-3 py-2 text-right font-medium">Reports</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {visible.map((t) => {
              const trk = t.track ?? "regular";
              const editableTrack = (EDITABLE_TRACKS as readonly string[]).includes(trk);
              return (
                <tr key={t.id} className={cn("border-b border-border align-top last:border-0", selected.has(t.id) && "bg-primary/5")}>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label={`Select ${t.title}`}
                      checked={selected.has(t.id)}
                      onChange={(e) => {
                        const next = new Set(selected);
                        if (e.target.checked) next.add(t.id);
                        else next.delete(t.id);
                        setSelected(next);
                      }}
                    />
                  </td>
                  <td className="min-w-56 px-3 py-2">
                    <RenameTestButton id={t.id} title={t.title} />
                    <p className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted">
                      <span className="capitalize">{t.skill}</span>
                      <span>·</span>
                      {t.kind === "full" ? (
                        <span>Full test</span>
                      ) : (
                        <select
                          aria-label="Passage"
                          className="rounded border border-transparent bg-transparent hover:border-border"
                          value={t.passage ?? ""}
                          disabled={busy === t.id}
                          onChange={(e) =>
                            save(t.id, { passage: e.target.value ? Number(e.target.value) : null }, "Passage saved.")
                          }
                        >
                          <option value="">{t.skill === "listening" ? "Section ?" : "Passage ?"}</option>
                          {[1, 2, 3, 4].map((n) => (
                            <option key={n} value={n}>
                              {t.skill === "listening" ? "Section" : "Passage"} {n}
                            </option>
                          ))}
                        </select>
                      )}
                      <span>·</span>
                      <button
                        type="button"
                        onClick={() => setEditingTypes(editingTypes === t.id ? null : t.id)}
                        className="inline-flex items-center gap-1 hover:text-foreground"
                        title={(t.question_types ?? []).join(", ") || "No question types"}
                      >
                        <Tags className="h-3 w-3" />
                        {(t.question_types ?? []).length} types
                      </button>
                      <span>·</span>
                      <span className="tabular-nums">{t.created_at.slice(0, 10)}</span>
                    </p>
                    {editingTypes === t.id && (
                      <TypesEditor
                        skill={t.skill}
                        value={t.question_types ?? []}
                        busy={busy === t.id}
                        onSave={async (types) => {
                          await save(t.id, { question_types: types }, "Question types saved.");
                          setEditingTypes(null);
                        }}
                        onCancel={() => setEditingTypes(null)}
                      />
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {editableTrack ? (
                      <select
                        aria-label="Tier"
                        value={t.tier}
                        disabled={busy === t.id}
                        onChange={(e) => save(t.id, { tier: e.target.value as "free" | "premium" }, `“${t.title}” is now ${e.target.value}.`)}
                        className={cn(
                          "rounded border px-1.5 py-0.5 text-xs font-medium",
                          t.tier === "premium" ? "border-premium/40 text-premium" : "border-border",
                          "bg-surface",
                        )}
                      >
                        <option value="free">Free</option>
                        <option value="premium">Premium</option>
                      </select>
                    ) : (
                      <span className="text-xs text-muted capitalize">{t.tier}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {editableTrack ? (
                      <select
                        aria-label="Track"
                        value={trk}
                        disabled={busy === t.id}
                        onChange={(e) => save(t.id, { track: e.target.value }, "Track saved.")}
                        className="rounded border border-border bg-surface px-1.5 py-0.5 text-xs"
                      >
                        {EDITABLE_TRACKS.map((v) => (
                          <option key={v} value={v}>
                            {TRACK_LABEL[v]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-xs text-muted" title="Managed on its own page">
                        {TRACK_LABEL[trk] ?? trk}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted">{t.total ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {t.attempts}
                    {t.students > 0 && <span className="block text-[11px] text-muted">{t.students} students</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {t.avg_band ?? "—"}
                    {t.avg_accuracy != null && <span className="block text-[11px] text-muted">{t.avg_accuracy}%</span>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {t.open_reports > 0 ? (
                      <a href="/admin/reports" className="inline-flex items-center gap-1 rounded bg-warning/15 px-1.5 py-0.5 text-xs font-medium text-warning">
                        <Flag className="h-3 w-3" /> {t.open_reports}
                      </a>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <span className="inline-flex items-center gap-1.5">
                      {busy === t.id && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted" />}
                      <a
                        href={`/api/test-html/${t.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1.5 text-xs text-muted hover:bg-surface-2"
                      >
                        <Eye className="h-3.5 w-3.5" /> Preview
                      </a>
                      <DeleteTestButton id={t.id} />
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="py-8 text-center text-[13px] text-muted">No tests match these filters.</p>}
      </div>

      {filtered.length > shown && (
        <div className="text-center">
          <button onClick={() => setShown(shown + PAGE)} className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium hover:border-primary/40">
            Show {Math.min(PAGE, filtered.length - shown)} more
          </button>
        </div>
      )}
    </div>
  );
}

function TypesEditor({
  skill,
  value,
  busy,
  onSave,
  onCancel,
}: {
  skill: "reading" | "listening";
  value: string[];
  busy: boolean;
  onSave: (types: string[]) => void;
  onCancel: () => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set(value));
  return (
    <div className="mt-2 rounded-md border border-border bg-background p-2.5">
      <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
        {QUESTION_TYPES[skill].map((t) => (
          <label key={t} className="flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={picked.has(t)}
              onChange={(e) => {
                const n = new Set(picked);
                if (e.target.checked) n.add(t);
                else n.delete(t);
                setPicked(n);
              }}
            />
            {t}
          </label>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <button
          disabled={busy}
          onClick={() => onSave([...picked])}
          className="rounded-md bg-foreground px-2.5 py-1 text-xs font-medium text-background disabled:opacity-50"
        >
          Save types
        </button>
        <button onClick={onCancel} className="text-xs text-muted hover:underline">
          Cancel
        </button>
      </div>
    </div>
  );
}
