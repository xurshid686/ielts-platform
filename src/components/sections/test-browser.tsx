"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import {
  Search,
  FileText,
  Layers,
  ArrowRight,
  X,
  Sparkles,
  Lock,
  Crown,
  Repeat2,
  ListChecks,
} from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

const NEW_WINDOW_MS = 24 * 60 * 60 * 1000; // a test stays "new" for 24 hours

export type BrowserItem = {
  id: string;
  title: string;
  kind: "single" | "full";
  tier: "free" | "premium";
  passage: number | null;
  level: string | null;
  questionTypes: string[];
  questionCount: number | null;
  timesDone: number;
  attempts: number;
  best: number | null;
  createdAt: string;
};

// Which tier section is showing. Deliberately keyed on the test's TIER, not on
// whether the viewer can open it: a subscriber can open everything, so an
// access-based "Free" filter would show them the whole library.
type Access = "all" | "free" | "premium";

export function TestBrowser({
  items,
  skill,
  canAccessPremium,
  unlockedIds = [],
  isAdmin = false,
}: {
  items: BrowserItem[];
  skill: "reading" | "listening";
  canAccessPremium: boolean;
  // Tests unlocked one-off with XP before subscriptions became the only
  // currency. Grandfathered: they must not show as locked.
  unlockedIds?: string[];
  isAdmin?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [qType, setQType] = useState("all");
  const [access, setAccess] = useState<Access>("all");
  // Captured once at mount so "new" is stable across re-renders.
  const [now] = useState(() => Date.now());

  const unlocked = useMemo(() => new Set(unlockedIds), [unlockedIds]);
  const isOpen = useMemo(
    () => (i: BrowserItem) => i.tier !== "premium" || canAccessPremium || unlocked.has(i.id),
    [canAccessPremium, unlocked],
  );

  const openCount = useMemo(() => items.filter(isOpen).length, [items, isOpen]);
  const lockedCount = items.length - openCount;

  const freeCount = useMemo(() => items.filter((i) => i.tier !== "premium").length, [items]);
  const premiumCount = items.length - freeCount;

  /**
   * Which tier leads the list. A free user must meet free material first — a
   * screen of locked cards reads as "this whole site is paid" and they leave.
   * A subscriber is paying for the premium library, so that is what they should
   * land on; free tests continue underneath.
   *
   * Note this is deliberately NOT the same as "what you can open": for a
   * subscriber everything is openable, so an openable-first sort would leave
   * their premium library buried among the free tests.
   */
  const leadingTier: "free" | "premium" = canAccessPremium ? "premium" : "free";
  const tierRank = useMemo(
    () => (i: BrowserItem) => (i.tier === leadingTier ? 0 : 1),
    [leadingTier],
  );

  // Filter tabs differ by skill: reading breaks down by passage.
  const tabDefs: { key: string; label: string; match: (i: BrowserItem) => boolean }[] =
    skill === "reading"
      ? [
          // "All formats", not "All" — the tier row above already has an "All",
          // and two stacked buttons both reading "All 121" is unreadable.
          { key: "all", label: "All formats", match: () => true },
          { key: "p1", label: "Passage 1", match: (i) => i.kind === "single" && i.passage === 1 },
          { key: "p2", label: "Passage 2", match: (i) => i.kind === "single" && i.passage === 2 },
          { key: "p3", label: "Passage 3", match: (i) => i.kind === "single" && i.passage === 3 },
          { key: "full", label: "Full tests", match: (i) => i.kind === "full" },
        ]
      : [
          { key: "all", label: "All formats", match: () => true },
          { key: "single", label: "Sections", match: (i) => i.kind === "single" },
          { key: "full", label: "Full tests", match: (i) => i.kind === "full" },
        ];

  const counts = useMemo(
    () => Object.fromEntries(tabDefs.map((t) => [t.key, items.filter(t.match).length])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, skill],
  );

  // Question types present across the current tests (for the dropdown).
  const availableTypes = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => i.questionTypes.forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [items]);

  const activeTab = tabDefs.find((t) => t.key === filter) ?? tabDefs[0];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = items.filter((i) => {
      if (!activeTab.match(i)) return false;
      if (qType !== "all" && !i.questionTypes.includes(qType)) return false;
      if (q && !i.title.toLowerCase().includes(q)) return false;
      if (access === "free" && i.tier === "premium") return false;
      if (access === "premium" && i.tier !== "premium") return false;
      return true;
    });

    // Free first for a free user, premium first for a subscriber. Newest within
    // each group.
    return matched.sort((a, b) => {
      const byTier = tierRank(a) - tierRank(b);
      if (byTier !== 0) return byTier;
      return +new Date(b.createdAt) - +new Date(a.createdAt);
    });
  }, [items, activeTab, qType, query, access, isOpen, tierRank]);

  // Where the second tier group starts, so a divider can be drawn there. Only
  // meaningful in the unfiltered "All" view — once a search or facet is active,
  // splitting the results into labelled groups fragments them for no benefit.
  const showGroups = access === "all" && !query.trim() && filter === "all" && qType === "all";
  const groupBreakAt = useMemo(() => {
    if (!showGroups) return -1;
    const idx = filtered.findIndex((i) => tierRank(i) === 1);
    return idx > 0 ? idx : -1;
  }, [filtered, showGroups, tierRank]);

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">All {skill} tests</h2>
          {/* Say the free count out loud. A grid of locked cards with no number
              next to it is what makes the library look entirely paid. */}
          <p className="mt-0.5 text-sm text-muted">
            <span className="font-medium text-foreground">
              {openCount} you can start now
            </span>
            {lockedCount > 0 && <> · {lockedCount} with Premium</>}
          </p>
        </div>
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title…"
            className="h-10 w-full rounded-lg border border-border bg-surface pl-9 pr-9 text-sm shadow-soft outline-none focus:border-primary/40 focus:ring-2 focus:ring-ring/30"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Tier sections — the primary control, on its own line above everything
          else. This is the question a student actually asks first: what can I
          use without paying? */}
      {premiumCount > 0 && freeCount > 0 && (
        <div className="flex flex-wrap gap-2">
          {(
            [
              { key: "all", label: "All", count: items.length },
              { key: "free", label: "Free", count: freeCount },
              { key: "premium", label: "Premium", count: premiumCount },
            ] as const
          ).map((a) => (
            <button
              key={a.key}
              onClick={() => setAccess(a.key)}
              className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition-colors ${
                access === a.key
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-surface text-muted hover:bg-surface-2 hover:text-foreground"
              }`}
            >
              {a.label}
              <span
                className={`rounded-full px-1.5 text-xs tabular-nums ${
                  access === a.key ? "bg-primary/15" : "bg-surface-2"
                }`}
              >
                {a.count}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Secondary filters: format tabs + question-type dropdown */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {tabDefs.map((t) => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                filter === t.key
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-surface text-muted hover:bg-surface-2 hover:text-foreground"
              }`}
            >
              {t.label}
              <span
                className={`rounded-full px-1.5 text-xs tabular-nums ${
                  filter === t.key ? "bg-primary/15" : "bg-surface-2"
                }`}
              >
                {counts[t.key] ?? 0}
              </span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {availableTypes.length > 0 && (
            <select
              value={qType}
              onChange={(e) => setQType(e.target.value)}
              className="h-9 rounded-lg border border-border bg-surface px-3 text-sm shadow-soft outline-none focus:border-primary/40"
            >
              <option value="all">All question types</option>
              {availableTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        items.length === 0 ? (
          <EmptyState
            icon={<FileText />}
            title={`No ${skill} tests yet`}
            desc="New tests are added regularly — check back soon."
          />
        ) : (
          <EmptyState
            icon={<Search />}
            title="No tests match"
            desc="Try a different search term or reset the filters below."
            action={
              <button
                onClick={() => {
                  setQuery("");
                  setFilter("all");
                  setQType("all");
                  setAccess("all");
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium shadow-soft transition-colors hover:bg-surface-2"
              >
                <X className="h-4 w-4" /> Clear filters
              </button>
            }
          />
        )
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {showGroups && (
            <GroupHeading
              label={leadingTier === "free" ? "Free tests" : "Your Premium tests"}
              count={leadingTier === "free" ? freeCount : premiumCount}
            />
          )}
          {filtered.map((t, idx) => {
            const locked = !isOpen(t);
            const isNew = now - new Date(t.createdAt).getTime() < NEW_WINDOW_MS;
            return (
              <Fragment key={t.id}>
                {idx === groupBreakAt && (
                  <GroupHeading
                    label={leadingTier === "free" ? "Premium tests" : "Free tests"}
                    count={leadingTier === "free" ? premiumCount : freeCount}
                    note={
                      leadingTier === "free"
                        ? "Included with a Premium membership"
                        : undefined
                    }
                  />
                )}
              <Link href={`/${skill}/${t.id}`} className="group">
                <div className="flex h-full flex-col rounded-2xl border border-border bg-surface p-5 shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-elevated">
                  <div className="flex items-start justify-between">
                    <span
                      className={`relative flex h-9 w-9 items-center justify-center rounded-xl ${
                        t.kind === "full"
                          ? "bg-accent/15 text-accent"
                          : "bg-primary/10 text-primary"
                      }`}
                    >
                      {t.kind === "full" ? (
                        <Layers className="h-5 w-5" />
                      ) : (
                        <FileText className="h-5 w-5" />
                      )}
                      {locked && (
                        <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-white">
                          <Lock className="h-2.5 w-2.5" />
                        </span>
                      )}
                    </span>
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      {isNew && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-emerald-400 to-teal-500 px-2 py-0.5 text-xs font-bold text-white shadow-sm">
                          <Sparkles className="h-3 w-3" /> NEW
                        </span>
                      )}
                      {t.tier === "premium" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 px-2 py-0.5 text-xs font-bold text-white shadow-sm">
                          <Crown className="h-3 w-3" /> Premium
                        </span>
                      )}
                      <Badge kind={t.kind} passage={t.passage} skill={skill} />
                      {t.questionCount != null && t.questionCount > 0 && (
                        <span
                          title={`${t.questionCount} question${t.questionCount > 1 ? "s" : ""}`}
                          className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted tabular-nums"
                        >
                          <ListChecks className="h-3 w-3" /> {t.questionCount}
                        </span>
                      )}
                      {/* Admins see the global completion count; students see
                          their own attempt count instead. */}
                      {isAdmin
                        ? t.timesDone > 0 && (
                            <span
                              title={`Completed ${t.timesDone} time${t.timesDone > 1 ? "s" : ""} across all students`}
                              className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted tabular-nums"
                            >
                              <Repeat2 className="h-3 w-3" /> {t.timesDone}
                            </span>
                          )
                        : t.attempts > 0 && (
                            <span
                              title={`Your attempts: ${t.attempts}`}
                              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary tabular-nums"
                            >
                              <Repeat2 className="h-3 w-3" /> {t.attempts}
                            </span>
                          )}
                      {/* `level` is deliberately not shown: it is NULL on 119 of
                          121 reading tests (only the admin upload form ever set
                          it, as free text), so the pill was noise that implied a
                          band grading the library does not actually have. */}
                    </div>
                  </div>

                  <h3 className="mt-3 font-semibold leading-snug">{t.title}</h3>

                  {t.questionTypes.length > 0 && (
                    <p className="mt-1 line-clamp-1 text-xs text-muted">
                      {t.questionTypes.join(" · ")}
                    </p>
                  )}

                  <div className="mt-3 flex items-center justify-between text-sm text-muted">
                    <span className="tabular-nums">
                      {locked
                        ? "Subscribers only"
                        : t.attempts
                          ? t.best != null
                            ? `Best band ${t.best}`
                            : "Attempted"
                          : "Not attempted"}
                    </span>
                    {locked ? (
                      <Lock className="h-4 w-4 text-amber-500" />
                    ) : (
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                    )}
                  </div>
                </div>
              </Link>
              </Fragment>
            );
          })}
        </div>
      )}
    </section>
  );
}

/**
 * A full-width label between the two tier groups. Sits inside the card grid and
 * spans every column so the boundary is unmistakable without splitting the list
 * into two separately-scrolling sections.
 */
function GroupHeading({
  label,
  count,
  note,
}: {
  label: string;
  count: number;
  note?: string;
}) {
  return (
    <div className="col-span-full flex flex-wrap items-baseline gap-x-2 gap-y-0.5 pt-2 first:pt-0">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">{label}</h3>
      <span className="rounded-full bg-surface-2 px-1.5 text-xs tabular-nums text-muted">
        {count}
      </span>
      {note && <span className="text-xs text-muted">· {note}</span>}
    </div>
  );
}

function Badge({
  kind,
  passage,
  skill,
}: {
  kind: "single" | "full";
  passage: number | null;
  skill: "reading" | "listening";
}) {
  if (kind === "full") {
    return (
      <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-medium text-accent">
        Full test
      </span>
    );
  }
  const label =
    skill === "reading" ? (passage ? `Passage ${passage}` : "Passage") : "Section";
  return (
    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
      {label}
    </span>
  );
}
