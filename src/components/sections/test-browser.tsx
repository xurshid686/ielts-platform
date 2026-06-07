"use client";

import { useMemo, useState } from "react";
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
} from "lucide-react";

const NEW_WINDOW_MS = 24 * 60 * 60 * 1000; // a test stays "new" for 24 hours

export type BrowserItem = {
  id: string;
  title: string;
  kind: "single" | "full";
  tier: "free" | "premium";
  passage: number | null;
  level: string | null;
  questionTypes: string[];
  attempts: number;
  best: number | null;
  createdAt: string;
};

export function TestBrowser({
  items,
  skill,
  canAccessPremium,
}: {
  items: BrowserItem[];
  skill: "reading" | "listening";
  canAccessPremium: boolean;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [qType, setQType] = useState("all");
  // Captured once at mount so "new" is stable across re-renders.
  const [now] = useState(() => Date.now());

  // Filter tabs differ by skill: reading breaks down by passage.
  const tabDefs: { key: string; label: string; match: (i: BrowserItem) => boolean }[] =
    skill === "reading"
      ? [
          { key: "all", label: "All", match: () => true },
          { key: "p1", label: "Passage 1", match: (i) => i.kind === "single" && i.passage === 1 },
          { key: "p2", label: "Passage 2", match: (i) => i.kind === "single" && i.passage === 2 },
          { key: "p3", label: "Passage 3", match: (i) => i.kind === "single" && i.passage === 3 },
          { key: "full", label: "Full tests", match: (i) => i.kind === "full" },
        ]
      : [
          { key: "all", label: "All", match: () => true },
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
    return items.filter((i) => {
      if (!activeTab.match(i)) return false;
      if (qType !== "all" && !i.questionTypes.includes(qType)) return false;
      if (q && !i.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, activeTab, qType, query]);

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold">Available tests</h2>
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

      {/* Filters row: type tabs + question-type dropdown */}
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

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted">
          {items.length === 0
            ? `No ${skill} tests have been uploaded yet.`
            : "No tests match your search or filters."}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => {
            const locked = t.tier === "premium" && !canAccessPremium;
            const isNew = now - new Date(t.createdAt).getTime() < NEW_WINDOW_MS;
            return (
              <Link key={t.id} href={`/${skill}/${t.id}`} className="group">
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
                      {t.level && (
                        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">
                          {t.level}
                        </span>
                      )}
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
                          ? `${t.attempts} attempt${t.attempts > 1 ? "s" : ""}${
                              t.best != null ? ` · best ${t.best}` : ""
                            }`
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
            );
          })}
        </div>
      )}
    </section>
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
