"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, FileText, Layers, ArrowRight, X, Sparkles } from "lucide-react";

const NEW_WINDOW_MS = 24 * 60 * 60 * 1000; // a test stays "new" for 24 hours

export type BrowserItem = {
  id: string;
  title: string;
  kind: "single" | "full";
  passage: number | null;
  level: string | null;
  attempts: number;
  best: number | null;
  createdAt: string;
};

type Filter = "all" | "single" | "full";

export function TestBrowser({
  items,
  skill,
}: {
  items: BrowserItem[];
  skill: "reading" | "listening";
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  // Captured once at mount so "new" is stable across re-renders (search/filter).
  const [now] = useState(() => Date.now());

  const singleLabel = skill === "reading" ? "Passages" : "Sections";
  const counts = useMemo(
    () => ({
      all: items.length,
      single: items.filter((i) => i.kind === "single").length,
      full: items.filter((i) => i.kind === "full").length,
    }),
    [items],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (filter !== "all" && i.kind !== filter) return false;
      if (q && !i.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, query, filter]);

  const tabs: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "All", count: counts.all },
    { key: "single", label: singleLabel, count: counts.single },
    { key: "full", label: "Full tests", count: counts.full },
  ];

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold">Available tests</h2>

        {/* Search */}
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

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
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
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted">
          {items.length === 0
            ? `No ${skill} tests have been uploaded yet.`
            : "No tests match your search or filter."}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => (
            <Link key={t.id} href={`/${skill}/${t.id}`} className="group">
              <div className="flex h-full flex-col rounded-2xl border border-border bg-surface p-5 shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-elevated">
                <div className="flex items-start justify-between">
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-xl ${
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
                  </span>
                  <div className="flex items-center gap-1.5">
                    {now - new Date(t.createdAt).getTime() < NEW_WINDOW_MS && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-emerald-400 to-teal-500 px-2 py-0.5 text-xs font-bold text-white shadow-sm">
                        <Sparkles className="h-3 w-3" /> NEW
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
                <h3 className="mt-3 flex-1 font-semibold leading-snug">{t.title}</h3>
                <div className="mt-3 flex items-center justify-between text-sm text-muted">
                  <span className="tabular-nums">
                    {t.attempts
                      ? `${t.attempts} attempt${t.attempts > 1 ? "s" : ""}${
                          t.best != null ? ` · best ${t.best}` : ""
                        }`
                      : "Not attempted"}
                  </span>
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </div>
              </div>
            </Link>
          ))}
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
