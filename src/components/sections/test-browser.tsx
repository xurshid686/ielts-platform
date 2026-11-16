"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { PREMIUM_PLANS } from "@/lib/site";
import {
  Search,
  FileText,
  ArrowRight,
  X,
  Lock,
  Crown,
  SlidersHorizontal,
} from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { testPath } from "@/lib/tests/ref";
import { estimatedMinutes } from "@/lib/tests/estimated-minutes";

const NEW_WINDOW_MS = 24 * 60 * 60 * 1000; // a test stays "new" for 24 hours

/**
 * How many cards are rendered before "Show more".
 *
 * The catalogue is 171 tests. Rendering every card put 506 KB of HTML on the
 * wire and made the browser hydrate 171 card subtrees before the page would
 * respond — the measured reason /reading felt slower than a static competitor
 * whose TTFB we already beat. Filtering and search still run over the FULL
 * `items` array, so nothing is hidden from a search; only the drawn list is
 * capped. (Rows now, not cards; the cap stays for the same reason.)
 */
const PAGE_SIZE = 24;

export type BrowserItem = {
  id: string;
  /** URL segment (migration 0044); falls back to `id` when absent. */
  slug: string | null;
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
  isAdmin = false,
  isGuest = false,
}: {
  items: BrowserItem[];
  skill: "reading" | "listening";
  canAccessPremium: boolean;
  isAdmin?: boolean;
  /** No account: "Not attempted" means nothing to them, so the card says "Start test". */
  isGuest?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [qType, setQType] = useState("all");
  const [access, setAccess] = useState<Access>("all");
  // Captured once at mount so "new" is stable across re-renders.
  const [now] = useState(() => Date.now());
  const [visible, setVisible] = useState(PAGE_SIZE);
  // The tier + question-type controls live in one popover on every screen
  // size, so the bar is always a single row of search, format and "Filters".
  const [filtersOpen, setFiltersOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!filtersOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!popoverRef.current?.contains(e.target as Node)) setFiltersOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFiltersOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [filtersOpen]);
  // The format segmented control is always visible, so only the two controls
  // inside the popover count toward the badge on the Filters button.
  const activeFilters = (qType !== "all" ? 1 : 0) + (access !== "all" ? 1 : 0);

  const isOpen = useMemo(
    () => (i: BrowserItem) => i.tier !== "premium" || canAccessPremium,
    [canAccessPremium],
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
  const tabDefs: { key: string; label: string; short: string; match: (i: BrowserItem) => boolean }[] =
    skill === "reading"
      ? [
          // "All formats", not "All" — the tier row above already has an "All",
          // and two stacked buttons both reading "All 121" is unreadable.
          { key: "all", label: "All formats", short: "All", match: () => true },
          { key: "p1", label: "Passage 1", short: "P1", match: (i) => i.kind === "single" && i.passage === 1 },
          { key: "p2", label: "Passage 2", short: "P2", match: (i) => i.kind === "single" && i.passage === 2 },
          { key: "p3", label: "Passage 3", short: "P3", match: (i) => i.kind === "single" && i.passage === 3 },
          { key: "full", label: "Full tests", short: "Full", match: (i) => i.kind === "full" },
        ]
      : [
          { key: "all", label: "All formats", short: "All", match: () => true },
          { key: "single", label: "Sections", short: "Sections", match: (i) => i.kind === "single" },
          { key: "full", label: "Full tests", short: "Full", match: (i) => i.kind === "full" },
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

  // How many tests carry each question type, for the dropdown labels.
  const typeCounts = useMemo(() => {
    const m: Record<string, number> = {};
    items.forEach((i) => i.questionTypes.forEach((t) => (m[t] = (m[t] ?? 0) + 1)));
    return m;
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
  }, [items, activeTab, qType, query, access, tierRank]);

  // Any change to the query or facets produces a different result set, so the
  // cap goes back to the first page — otherwise a search made after "Show more"
  // would keep rendering an expanded list for no reason.
  //
  // Adjusted during render rather than in an effect: React re-runs this
  // component immediately with the corrected value, so the capped list never
  // paints at the wrong length (an effect would flash the expanded list first).
  const facetKey = `${query}|${filter}|${qType}|${access}`;
  const [prevFacetKey, setPrevFacetKey] = useState(facetKey);
  if (prevFacetKey !== facetKey) {
    setPrevFacetKey(facetKey);
    setVisible(PAGE_SIZE);
  }

  const shown = useMemo(() => filtered.slice(0, visible), [filtered, visible]);
  const remaining = filtered.length - shown.length;

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
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">All {skill} tests</h2>
        {/* Say the free count out loud. A list of locked rows with no number
            next to it is what makes the library look entirely paid. */}
        <p className="mt-0.5 text-sm text-muted">
          <span className="font-medium text-foreground">{openCount} you can start now</span>
          {lockedCount > 0 && <> · {lockedCount} with Premium</>}
        </p>
      </div>

      {/* One control bar: search, format, and a Filters popover for the rest. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative order-1 min-w-0 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title…"
            aria-label="Search tests by title"
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

        <div
          role="group"
          aria-label="Format"
          className="order-3 flex w-full min-w-0 gap-0.5 overflow-x-auto rounded-lg border border-border bg-surface-2 p-0.5 sm:order-2 sm:w-auto sm:flex-none"
        >
          {tabDefs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setFilter(t.key)}
              aria-pressed={filter === t.key}
              className={`inline-flex h-9 flex-1 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2 text-sm sm:flex-none sm:px-3 font-medium transition-colors ${
                filter === t.key
                  ? "bg-surface text-foreground shadow-soft"
                  : "text-muted hover:text-foreground"
              }`}
            >
              <span className="sm:hidden">{t.short}</span>
              <span className="hidden sm:inline">{t.label}</span>
              <span className="text-xs tabular-nums text-muted">{counts[t.key] ?? 0}</span>
            </button>
          ))}
        </div>

        <div ref={popoverRef} className="relative order-2 sm:order-3">
          <button
            type="button"
            onClick={() => setFiltersOpen((o) => !o)}
            aria-expanded={filtersOpen}
            aria-controls="test-filters"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-surface px-3.5 text-sm font-medium shadow-soft hover:bg-surface-2"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filters
            {activeFilters > 0 && (
              <span className="rounded-full bg-primary/15 px-1.5 text-xs tabular-nums text-primary">
                {activeFilters}
              </span>
            )}
          </button>
          {filtersOpen && (
            <div
              id="test-filters"
              className="absolute right-0 top-full z-20 mt-2 w-[min(20rem,calc(100vw-2rem))] space-y-4 rounded-xl border border-border bg-surface p-4 shadow-elevated"
            >
              {premiumCount > 0 && freeCount > 0 && (
                <fieldset>
                  <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                    Tier
                  </legend>
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
                        type="button"
                        onClick={() => setAccess(a.key)}
                        aria-pressed={access === a.key}
                        className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors ${
                          access === a.key
                            ? "border-primary/40 bg-primary/10 text-primary"
                            : "border-border bg-surface text-muted hover:bg-surface-2 hover:text-foreground"
                        }`}
                      >
                        {a.label}
                        <span className="text-xs tabular-nums">{a.count}</span>
                      </button>
                    ))}
                  </div>
                </fieldset>
              )}
              {availableTypes.length > 0 && (
                <div>
                  <label
                    htmlFor="test-qtype"
                    className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted"
                  >
                    Question type
                  </label>
                  <select
                    id="test-qtype"
                    value={qType}
                    onChange={(e) => setQType(e.target.value)}
                    className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-primary/40"
                  >
                    <option value="all">All question types</option>
                    {availableTypes.map((t) => (
                      <option key={t} value={t}>
                        {t} ({typeCounts[t] ?? 0})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setFiltersOpen(false)}
                  className="h-9 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
                >
                  Show {filtered.length} test{filtered.length === 1 ? "" : "s"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Active filters as removable chips, so a closed popover never hides why
          the list is short. */}
      {(access !== "all" || qType !== "all") && (
        <div className="flex flex-wrap items-center gap-2">
          {access !== "all" && (
            <FilterChip
              label={access === "free" ? "Free" : "Premium"}
              onRemove={() => setAccess("all")}
            />
          )}
          {qType !== "all" && <FilterChip label={qType} onRemove={() => setQType("all")} />}
          <button
            type="button"
            onClick={() => {
              setAccess("all");
              setQType("all");
            }}
            className="text-sm text-muted underline-offset-2 hover:text-foreground hover:underline"
          >
            Clear filters
          </button>
        </div>
      )}

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
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {showGroups && (
            <GroupHeading
              label={leadingTier === "free" ? "Free tests" : "Your Premium tests"}
              count={leadingTier === "free" ? freeCount : premiumCount}
            />
          )}
          {shown.map((t, idx) => {
            const locked = !isOpen(t);
            const isNew = now - new Date(t.createdAt).getTime() < NEW_WINDOW_MS;
            const mins = estimatedMinutes(skill, t.kind);
            const kindLabel =
              t.kind === "full"
                ? "Full test"
                : skill === "reading"
                  ? t.passage
                    ? `Passage ${t.passage}`
                    : "Passage"
                  : "Section";
            const hasQs = t.questionCount != null && t.questionCount > 0;
            return (
              <Fragment key={t.id}>
                {idx === groupBreakAt && (
                  <GroupHeading
                    label={leadingTier === "free" ? "Premium tests" : "Free tests"}
                    count={leadingTier === "free" ? premiumCount : freeCount}
                    note={
                      leadingTier === "free"
                        ? `Included with Premium, from ${PREMIUM_PLANS[0].price}`
                        : undefined
                    }
                  />
                )}
                <li>
                  {/* A locked row keeps its real title at full contrast and is never
                      blurred (owner, 2026-11-10): the title is what sells a premium
                      passage. It gets a Premium rule, tint and its price instead. */}
                  <Link
                    href={testPath(skill, t)}
                    className={`group relative flex min-h-14 items-center gap-3 py-3 pl-5 pr-4 transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none ${
                      locked ? "bg-premium/5" : ""
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`absolute inset-y-0 left-0 w-1 ${
                        locked
                          ? "bg-premium"
                          : skill === "reading"
                            ? "bg-skill-reading/70"
                            : "bg-skill-listening/70"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <h3 className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-semibold leading-snug">
                        <span>{t.title}</span>
                        {t.tier === "premium" && (
                          <Crown
                            className="h-3.5 w-3.5 shrink-0 text-premium"
                            aria-label="Premium"
                          />
                        )}
                        {isNew && (
                          <span className="text-xs font-semibold uppercase tracking-wide text-primary">
                            New
                          </span>
                        )}
                      </h3>
                      {/* Phones: one compact facts line. md+: the same facts sit in
                          their own columns on the right. */}
                      <p className="mt-0.5 text-xs text-muted md:hidden">
                        {kindLabel}
                        {hasQs && <> · {t.questionCount} Qs</>} · ~{mins} min
                      </p>
                      {t.questionTypes.length > 0 && (
                        <p className="mt-0.5 hidden line-clamp-1 text-xs text-muted sm:block">
                          {t.questionTypes.join(" · ")}
                        </p>
                      )}
                    </div>

                    <span
                      className={`hidden w-24 shrink-0 text-sm md:block ${
                        t.kind === "full" ? "font-medium text-foreground" : "text-muted"
                      }`}
                    >
                      {kindLabel}
                    </span>
                    <span className="hidden w-16 shrink-0 text-sm tabular-nums text-muted md:block">
                      {hasQs ? `${t.questionCount} Qs` : ""}
                    </span>
                    <span className="hidden w-20 shrink-0 text-sm tabular-nums text-muted md:block">
                      ~{mins} min
                    </span>

                    <span
                      className={`shrink-0 text-right text-sm tabular-nums md:w-36 ${
                        locked ? "font-medium text-premium" : "text-muted"
                      }`}
                    >
                      {locked ? (
                        <>Unlock from {PREMIUM_PLANS[0].price}</>
                      ) : isAdmin ? (
                        t.timesDone > 0 ? (
                          <span title="Completed across all students">{t.timesDone} done</span>
                        ) : null
                      ) : t.attempts > 0 ? (
                        <>
                          <span className="font-semibold text-foreground">
                            {t.best != null ? `Best ${t.best}` : "Attempted"}
                          </span>
                          {t.attempts > 1 && <> · {t.attempts}×</>}
                        </>
                      ) : isGuest ? null : (
                        "Not attempted"
                      )}
                    </span>

                    {locked ? (
                      <Lock className="h-4 w-4 shrink-0 text-premium" />
                    ) : (
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted transition-colors group-hover:text-primary" />
                    )}
                  </Link>
                </li>
              </Fragment>
            );
          })}
        </ul>
      )}

      {remaining > 0 && (
        <div className="flex justify-center pt-2">
          <button
            onClick={() => setVisible((v) => v + PAGE_SIZE)}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-5 py-2.5 text-sm font-semibold shadow-soft transition-colors hover:bg-surface-2"
          >
            Show {Math.min(remaining, PAGE_SIZE)} more
            <span className="text-muted tabular-nums">({remaining} left)</span>
          </button>
        </div>
      )}
    </section>
  );
}

/**
 * A label row between the two tier groups, inside the same bordered list so the
 * boundary is unmistakable without splitting the list in two.
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
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 bg-surface-2/60 px-5 py-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</h3>
      <span className="text-xs tabular-nums text-muted">{count}</span>
      {note && <span className="text-xs text-muted">· {note}</span>}
    </li>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 pl-3 pr-1.5 text-sm font-medium text-primary">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove filter ${label}`}
        className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-primary/15"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}
