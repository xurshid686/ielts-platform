"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  Search,
  Loader2,
  Plus,
  X,
  Trash2,
  RotateCcw,
  AlertTriangle,
  UserPlus,
  BookOpen,
  Headphones,
} from "lucide-react";
import {
  grantDiscipline,
  revokeDiscipline,
  addDisciplineStrike,
  resetDiscipline,
  searchStudents,
  addDisciplineDay,
  deleteDisciplineDay,
  attachTest,
  detachTest,
  searchAttachableTests,
  type DisciplineMemberRow,
  type PickableTest,
} from "@/app/actions/discipline";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { STRIKE_LIMIT } from "@/lib/discipline-shared";
import { cn } from "@/lib/utils";

type Day = {
  id: string;
  day_number: number;
  title: string | null;
  instructions: string | null;
  tests: { id: string; title: string; skill: "reading" | "listening"; track: string }[];
};

type Tab = "members" | "programme" | "progress";

export function AdminDiscipline({
  initialMembers,
  days,
}: {
  initialMembers: DisciplineMemberRow[];
  days: Day[];
}) {
  const [tab, setTab] = useState<Tab>("members");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <div className="space-y-5">
      <nav className="flex flex-wrap gap-1.5">
        {(
          [
            ["members", `Members (${initialMembers.length})`],
            ["programme", `Programme (${days.length} days)`],
            ["progress", "Progress"],
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
              tab === id
                ? "bg-primary/10 text-primary"
                : "text-muted hover:bg-surface-2 hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </nav>

      {msg && (
        <p
          className={cn(
            "rounded-lg border px-3 py-2 text-sm",
            msg.ok
              ? "border-success/30 bg-success/5 text-success"
              : "border-danger/30 bg-danger/5 text-danger",
          )}
        >
          {msg.text}
        </p>
      )}

      {tab === "members" && <Members members={initialMembers} onMsg={setMsg} />}
      {tab === "programme" && <Programme days={days} onMsg={setMsg} />}
      {tab === "progress" && <Progress members={initialMembers} days={days} />}
    </div>
  );
}

// --------------------------------------------------------------- members

function Members({
  members,
  onMsg,
}: {
  members: DisciplineMemberRow[];
  onMsg: (m: { ok: boolean; text: string } | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{ id: string; email: string | null; name: string | null }[]>(
    [],
  );
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const memberEmails = new Set(members.map((m) => m.email?.toLowerCase()).filter(Boolean));

  async function run(
    key: string,
    fn: () => Promise<{ ok: true } | { ok: false; error: string }>,
    okText: string,
  ) {
    setBusy(key);
    const res = await fn();
    setBusy(null);
    onMsg(res.ok ? { ok: true, text: okText } : { ok: false, text: res.error });
    if (res.ok) startTransition(() => window.location.reload());
  }

  return (
    <div className="space-y-5">
      <Card className="space-y-3">
        <h2 className="flex items-center gap-2 font-semibold">
          <UserPlus className="h-4 w-4 text-primary" /> Add a student
        </h2>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setSearching(true);
            onMsg(null);
            const res = await searchStudents(query);
            setSearching(false);
            if (res.ok) setFound(res.users);
            else onMsg({ ok: false, text: res.error });
          }}
          className="flex gap-2"
        >
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or email…"
              className="admin-input w-full pl-9"
            />
          </div>
          <Button type="submit" disabled={searching}>
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
          </Button>
        </form>

        {found.length > 0 && (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {found.map((u) => {
              const already = !!u.email && memberEmails.has(u.email.toLowerCase());
              return (
                <li key={u.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{u.name || "Student"}</p>
                    <p className="truncate text-xs text-muted">{u.email}</p>
                  </div>
                  <Button
                    variant="outline"
                    disabled={already || !u.email || busy === u.id}
                    onClick={() =>
                      run(u.id, () => grantDiscipline(u.email!), `${u.email} added to Discipline.`)
                    }
                  >
                    {busy === u.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : already ? (
                      "In challenge"
                    ) : (
                      "Add"
                    )}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {members.length === 0 ? (
        <p className="text-sm text-muted">Nobody is in the challenge yet.</p>
      ) : (
        <ul className="space-y-2">
          {members.map((m) => (
            <li key={m.user_id}>
              <Card className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{m.name || "Student"}</p>
                  <p className="truncate text-xs text-muted">{m.email}</p>
                </div>

                <div className="flex items-center gap-4 text-sm tabular-nums">
                  <span>
                    <span className="text-muted">Day </span>
                    <b>{m.current_day}</b>
                  </span>
                  <span>
                    <span className="text-muted">Done </span>
                    <b>{m.completed}</b>
                  </span>
                  <span className={cn(m.strikes >= STRIKE_LIMIT && "text-danger")}>
                    <span className="text-muted">Strikes </span>
                    <b>
                      {m.strikes}/{STRIKE_LIMIT}
                    </b>
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    disabled={!m.email || busy === `s-${m.user_id}`}
                    onClick={() =>
                      run(
                        `s-${m.user_id}`,
                        () => addDisciplineStrike(m.email!),
                        `Strike recorded for ${m.email}.`,
                      )
                    }
                  >
                    <AlertTriangle className="h-4 w-4" /> Strike
                  </Button>
                  <Button
                    variant="outline"
                    disabled={!m.email || busy === `r-${m.user_id}`}
                    onClick={() => {
                      if (
                        !confirm(
                          `Reset ${m.email} to Day 1? Their completed days are cleared. They keep their place in the challenge.`,
                        )
                      )
                        return;
                      run(
                        `r-${m.user_id}`,
                        () => resetDiscipline(m.email!),
                        `${m.email} is back to Day 1.`,
                      );
                    }}
                  >
                    <RotateCcw className="h-4 w-4" /> Reset
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={!m.email || busy === `x-${m.user_id}`}
                    onClick={() => {
                      if (!confirm(`Remove ${m.email} from Discipline?`)) return;
                      run(
                        `x-${m.user_id}`,
                        () => revokeDiscipline(m.email!),
                        `${m.email} removed.`,
                      );
                    }}
                  >
                    <X className="h-4 w-4" /> Remove
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// -------------------------------------------------------------- programme

function Programme({
  days,
  onMsg,
}: {
  days: Day[];
  onMsg: (m: { ok: boolean; text: string } | null) => void;
}) {
  const nextDay = (days.at(-1)?.day_number ?? 0) + 1;
  const [dayNumber, setDayNumber] = useState(String(nextDay));
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [testQuery, setTestQuery] = useState("");
  const [tests, setTests] = useState<PickableTest[]>([]);

  async function run(
    key: string,
    fn: () => Promise<{ ok: true } | { ok: false; error: string }>,
    okText: string,
  ) {
    setBusy(key);
    const res = await fn();
    setBusy(null);
    onMsg(res.ok ? { ok: true, text: okText } : { ok: false, text: res.error });
    if (res.ok) window.location.reload();
  }

  return (
    <div className="space-y-5">
      <Card className="space-y-3">
        <h2 className="flex items-center gap-2 font-semibold">
          <Plus className="h-4 w-4 text-primary" /> Add a day
        </h2>
        <div className="grid gap-3 sm:grid-cols-[110px_1fr]">
          <label className="space-y-1.5">
            <span className="text-sm font-medium">Day</span>
            <input
              value={dayNumber}
              onChange={(e) => setDayNumber(e.target.value)}
              inputMode="numeric"
              className="admin-input w-full"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-medium">Title (optional)</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Warm-up"
              className="admin-input w-full"
            />
          </label>
        </div>
        <label className="space-y-1.5">
          <span className="text-sm font-medium">Instructions (optional)</span>
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={2}
            placeholder="What the student should do today."
            className="admin-input w-full"
          />
        </label>
        <Button
          disabled={busy === "add"}
          onClick={() =>
            run(
              "add",
              () => addDisciplineDay(Number(dayNumber), title, instructions),
              `Day ${dayNumber} added.`,
            )
          }
        >
          {busy === "add" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add day"}
        </Button>
      </Card>

      <p className="text-sm text-muted">
        To upload a paper that only Discipline students can open, go to{" "}
        <Link href="/admin/tests" className="text-primary hover:underline">
          Manage tests
        </Link>{" "}
        and set <b>For</b> to &ldquo;Discipline challenge only&rdquo;, then attach it to a day here.
      </p>

      {days.map((d) => (
        <Card key={d.id} className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-semibold">
                Day {d.day_number}
                {d.title ? ` — ${d.title}` : ""}
              </p>
              {d.instructions && (
                <p className="mt-0.5 whitespace-pre-line text-sm text-muted">{d.instructions}</p>
              )}
            </div>
            <Button
              variant="ghost"
              disabled={busy === `d-${d.id}`}
              onClick={() => {
                if (!confirm(`Delete Day ${d.day_number}? The tests themselves are kept.`)) return;
                run(`d-${d.id}`, () => deleteDisciplineDay(d.id), `Day ${d.day_number} deleted.`);
              }}
            >
              <Trash2 className="h-4 w-4" /> Delete day
            </Button>
          </div>

          <ul className="space-y-1.5">
            {d.tests.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
              >
                <span className="flex min-w-0 items-center gap-2 text-sm">
                  {t.skill === "listening" ? (
                    <Headphones className="h-4 w-4 shrink-0 text-muted" />
                  ) : (
                    <BookOpen className="h-4 w-4 shrink-0 text-muted" />
                  )}
                  <span className="truncate">{t.title}</span>
                  {t.track === "discipline" && (
                    <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      Discipline only
                    </span>
                  )}
                </span>
                <Button
                  variant="ghost"
                  disabled={busy === `t-${d.id}-${t.id}`}
                  onClick={() =>
                    run(`t-${d.id}-${t.id}`, () => detachTest(d.id, t.id), "Test removed.")
                  }
                >
                  <X className="h-4 w-4" />
                </Button>
              </li>
            ))}
            {d.tests.length === 0 && <li className="text-sm text-muted">No tests yet.</li>}
          </ul>

          {pickerFor === d.id ? (
            <div className="space-y-2 rounded-lg border border-border p-3">
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const res = await searchAttachableTests(testQuery);
                  if (res.ok) setTests(res.tests);
                  else onMsg({ ok: false, text: res.error });
                }}
                className="flex gap-2"
              >
                <input
                  value={testQuery}
                  onChange={(e) => setTestQuery(e.target.value)}
                  placeholder="Search tests by title…"
                  className="admin-input w-full"
                />
                <Button type="submit">Search</Button>
                <Button variant="ghost" type="button" onClick={() => setPickerFor(null)}>
                  Cancel
                </Button>
              </form>
              <ul className="max-h-64 space-y-1 overflow-y-auto">
                {tests.map((t) => (
                  <li key={t.id}>
                    <button
                      disabled={busy === `a-${t.id}`}
                      onClick={() =>
                        run(
                          `a-${t.id}`,
                          () => attachTest(d.id, t.id, d.tests.length),
                          `${t.title} attached to Day ${d.day_number}.`,
                        )
                      }
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2"
                    >
                      {t.skill === "listening" ? (
                        <Headphones className="h-4 w-4 shrink-0 text-muted" />
                      ) : (
                        <BookOpen className="h-4 w-4 shrink-0 text-muted" />
                      )}
                      <span className="truncate">{t.title}</span>
                      {t.track === "discipline" && (
                        <span className="ml-auto shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          Discipline only
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <Button
              variant="outline"
              onClick={() => {
                setPickerFor(d.id);
                setTests([]);
                setTestQuery("");
              }}
            >
              <Plus className="h-4 w-4" /> Attach a test
            </Button>
          )}
        </Card>
      ))}

      {days.length === 0 && <p className="text-sm text-muted">No days yet. Add Day 1 above.</p>}
    </div>
  );
}

// --------------------------------------------------------------- progress

function Progress({ members, days }: { members: DisciplineMemberRow[]; days: Day[] }) {
  if (members.length === 0 || days.length === 0) {
    return <p className="text-sm text-muted">Add students and days to see progress here.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted">
            <th className="py-2 pr-4 font-medium">Student</th>
            <th className="py-2 pr-4 font-medium">Day</th>
            <th className="py-2 pr-4 font-medium">Completed</th>
            <th className="py-2 font-medium">Strikes</th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.user_id} className="border-b border-border/60">
              <td className="py-2 pr-4">
                <p className="font-medium">{m.name || "Student"}</p>
                <p className="text-xs text-muted">{m.email}</p>
              </td>
              <td className="py-2 pr-4 tabular-nums">{m.current_day}</td>
              <td className="py-2 pr-4 tabular-nums">
                {m.completed} / {days.length}
              </td>
              <td
                className={cn(
                  "py-2 tabular-nums",
                  m.strikes >= STRIKE_LIMIT && "font-semibold text-danger",
                )}
              >
                {m.strikes} / {STRIKE_LIMIT}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
