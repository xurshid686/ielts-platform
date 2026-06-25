"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ExternalLink,
  Sparkles,
  CheckCircle2,
  Circle,
  Search,
  X,
} from "lucide-react";
import type { SpeakingQuestion } from "@/types/database";

type Part = 0 | 1 | 2 | 3; // 0 = All parts
type Status = "all" | "done" | "todo";

const PART_TABS: { key: Part; label: string }[] = [
  { key: 0, label: "All" },
  { key: 1, label: "Part 1" },
  { key: 2, label: "Part 2" },
  { key: 3, label: "Part 3" },
];

const STATUS_TABS: { key: Status; label: string }[] = [
  { key: "all", label: "All" },
  { key: "done", label: "Completed" },
  { key: "todo", label: "Not attempted" },
];

const PART_BLURB: Record<number, string> = {
  1: "Short personal interview questions.",
  2: "Cue cards — the long-turn task.",
  3: "Abstract discussion follow-ups.",
};

function parsePart(value: string | null): Part {
  return value === "1" || value === "2" || value === "3"
    ? (Number(value) as Part)
    : 0;
}
function parseStatus(value: string | null): Status {
  return value === "done" || value === "todo" ? value : "all";
}

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
      <div
        className="h-full rounded-full bg-emerald-600 transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function QuestionBank({
  questions,
  completedIds,
}: {
  questions: SpeakingQuestion[];
  completedIds: string[];
}) {
  const completed = new Set(completedIds);
  const isDone = (q: SpeakingQuestion) => completed.has(q.id);

  // Initialise from the URL so returning from a topic keeps the exact view.
  const searchParams = useSearchParams();
  const [part, setPart] = useState<Part>(() => parsePart(searchParams.get("part")));
  const [status, setStatus] = useState<Status>(() =>
    parseStatus(searchParams.get("status")),
  );
  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");

  function syncUrl(nextPart: Part, nextStatus: Status, nextSearch: string) {
    const params = new URLSearchParams(window.location.search);
    if (nextPart === 0) params.delete("part");
    else params.set("part", String(nextPart));
    if (nextStatus === "all") params.delete("status");
    else params.set("status", nextStatus);
    if (nextSearch.trim() === "") params.delete("q");
    else params.set("q", nextSearch);
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      query ? `${window.location.pathname}?${query}` : window.location.pathname,
    );
  }
  function selectPart(key: Part) {
    setPart(key);
    syncUrl(key, status, search);
  }
  function selectStatus(key: Status) {
    setStatus(key);
    syncUrl(part, key, search);
  }
  function onSearch(value: string) {
    setSearch(value);
    syncUrl(part, status, value);
  }

  const query = search.trim().toLowerCase();
  const matchesPart = (q: SpeakingQuestion) => part === 0 || q.part === part;
  const matchesStatus = (q: SpeakingQuestion) =>
    status === "all" || (status === "done" ? isDone(q) : !isDone(q));
  const matchesSearch = (q: SpeakingQuestion) =>
    query === "" ||
    q.title.toLowerCase().includes(query) ||
    (q.content ?? "").toLowerCase().includes(query);

  const partCount = (p: Part) =>
    questions.filter(
      (q) => (p === 0 || q.part === p) && matchesStatus(q) && matchesSearch(q),
    ).length;
  const statusCount = (s: Status) =>
    questions.filter(
      (q) =>
        matchesPart(q) &&
        matchesSearch(q) &&
        (s === "all" || (s === "done" ? isDone(q) : !isDone(q))),
    ).length;

  const visible = questions.filter(
    (q) => matchesPart(q) && matchesStatus(q) && matchesSearch(q),
  );

  // Progress (independent of the current filters).
  const doneTotal = questions.filter(isDone).length;
  const partProgress = [1, 2, 3].map((p) => {
    const inPart = questions.filter((q) => q.part === p);
    return { p, done: inPart.filter(isDone).length, total: inPart.length };
  });

  return (
    <div className="space-y-5">
      {/* Progress overview */}
      <div className="rounded-2xl border border-border bg-surface p-5">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold">Your progress</span>
          <span className="text-muted">
            <span className="font-semibold text-emerald-600">{doneTotal}</span> /{" "}
            {questions.length} topics
          </span>
        </div>
        <div className="mt-2">
          <ProgressBar done={doneTotal} total={questions.length} />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {partProgress.map(({ p, done, total }) => (
            <div key={p}>
              <div className="flex items-center justify-between text-xs text-muted">
                <span className="font-medium text-foreground">Part {p}</span>
                <span>
                  {done}/{total}
                </span>
              </div>
              <div className="mt-1">
                <ProgressBar done={done} total={total} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search topics…"
          className="w-full rounded-full border border-border bg-surface py-2.5 pl-10 pr-10 text-sm outline-none focus:border-primary"
        />
        {search && (
          <button
            type="button"
            onClick={() => onSearch("")}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Part filter */}
      <div className="flex flex-wrap gap-2">
        {PART_TABS.map(({ key, label }) => {
          const active = part === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => selectPart(key)}
              aria-pressed={active}
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-surface text-foreground hover:border-primary/50"
              }`}
            >
              {label}
              <span
                className={`rounded-full px-1.5 text-xs ${
                  active ? "bg-primary-foreground/20" : "bg-primary/10 text-primary"
                }`}
              >
                {partCount(key)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map(({ key, label }) => {
          const active = status === key;
          const tone =
            key === "done"
              ? "text-emerald-600"
              : key === "todo"
                ? "text-red-500"
                : "text-primary";
          return (
            <button
              key={key}
              type="button"
              onClick={() => selectStatus(key)}
              aria-pressed={active}
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-surface text-foreground hover:border-foreground/40"
              }`}
            >
              {label}
              <span
                className={`rounded-full px-1.5 ${
                  active ? "bg-background/20" : `bg-surface-2 ${tone}`
                }`}
              >
                {statusCount(key)}
              </span>
            </button>
          );
        })}
      </div>

      {part !== 0 && <p className="text-sm text-muted">{PART_BLURB[part]}</p>}

      {/* Question list */}
      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted">
          No topics match {query ? `"${search}"` : "this filter"}.
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((q) => {
            const done = isDone(q);
            return (
              <details
                key={q.id}
                className="group rounded-2xl border border-border bg-surface p-5"
              >
                <summary className="flex cursor-pointer items-center justify-between gap-3">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                      Part {q.part}
                    </span>
                    {q.number && (
                      <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                        {q.number}
                      </span>
                    )}
                    <span className="font-semibold">{q.title}</span>
                    {done ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-600/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">
                        <CheckCircle2 className="h-3 w-3" /> Completed
                      </span>
                    ) : (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-500">
                        <Circle className="h-3 w-3" /> Not attempted
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-muted transition-transform group-open:rotate-180">
                    ▾
                  </span>
                </summary>
                <div className="mt-4 whitespace-pre-line text-sm leading-relaxed text-foreground/90">
                  {q.content}
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-4">
                  <Link
                    href={`/speaking/questions/${q.id}`}
                    className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                  >
                    <Sparkles className="h-3.5 w-3.5" /> Practice this topic
                  </Link>
                  {q.channel_link && (
                    <a
                      href={q.channel_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      View in channel <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}
