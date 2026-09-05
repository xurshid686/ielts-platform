"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Loader2,
  Plus,
  X,
  Trash2,
  RotateCcw,
  AlertTriangle,
  BookOpen,
  Headphones,
  ChevronUp,
  ChevronDown,
  Pencil,
  Upload,
  Check,
  Eye,
  EyeOff,
  FileDown,
  AtSign,
} from "lucide-react";
import {
  grantDiscipline,
  revokeDiscipline,
  addDisciplineStrike,
  resetDiscipline,
  searchStudents,
  addDisciplineDay,
  updateDisciplineDay,
  deleteDisciplineDay,
  moveDay,
  attachTest,
  detachTest,
  moveTest,
  setDayPublished,
  exportDisciplineReport,
  uploadDisciplineTest,
  searchAttachableTests,
  type PickableTest,
  type StudentRow,
} from "@/app/actions/discipline";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { STRIKE_LIMIT } from "@/lib/discipline-shared";
import { cn } from "@/lib/utils";
import type { ProgressGrid, GridCellTest, DisciplineMemberRow } from "@/lib/discipline";

type Day = {
  id: string;
  day_number: number;
  title: string | null;
  instructions: string | null;
  /** false = draft. Built here, invisible to students until Publish (0047). */
  published: boolean;
  tests: { id: string; title: string; skill: "reading" | "listening"; track: string }[];
};

type Msg = { ok: boolean; text: string } | null;
type Tab = "members" | "programme" | "progress";

export function AdminDiscipline({
  initialMembers,
  days,
  roster,
  grid,
}: {
  initialMembers: DisciplineMemberRow[];
  days: Day[];
  roster: StudentRow[];
  grid: ProgressGrid;
}) {
  const [tab, setTab] = useState<Tab>("members");
  const [msg, setMsg] = useState<Msg>(null);

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

      {/* Sticky, because the message now SURVIVES the action that set it (the
          old reload wiped it before it could be read) and the day list is long
          enough that the top of the page is often off screen. `bg-surface` is
          opaque on purpose — a translucent banner would have day cards
          scrolling visibly through the text. */}
      {msg && (
        <p
          className={cn(
            "sticky top-0 z-10 rounded-lg border bg-surface px-3 py-2 text-sm shadow-soft",
            msg.ok
              ? "border-success/30 text-success"
              : "border-danger/30 text-danger",
          )}
        >
          {msg.text}
        </p>
      )}

      {tab === "members" && (
        <Members members={initialMembers} roster={roster} onMsg={setMsg} />
      )}
      {tab === "programme" && <Programme days={days} onMsg={setMsg} />}
      {tab === "progress" && <Progress grid={grid} onMsg={setMsg} />}
    </div>
  );
}

/**
 * Runs a server action, reports the outcome, and pulls the fresh server data
 * into the page on success.
 *
 * IT MUST NOT RELOAD THE PAGE. It used to end with `window.location.reload()`,
 * which threw the owner back to the top of the Members tab after every publish,
 * upload, edit or reorder — and destroyed the confirmation message this hook had
 * just set, so "Day 5 is live" was never actually readable. Building a programme
 * is dozens of these in a row.
 *
 * `router.refresh()` re-fetches the server component and patches the new props
 * in, leaving the tab, the scroll position and any open panel exactly as they
 * were. Every action in actions/discipline.ts already calls `revalidatePath`, so
 * the data being refetched is current. This is the same pattern the rest of the
 * admin UI uses (admin-team.tsx, delete-test-button.tsx, upload-form.tsx).
 *
 * `busy` is held until the refresh LANDS, not merely until the action resolves:
 * re-enabling the buttons while the list still shows stale data invites a second
 * click on a row that has already moved.
 *
 * `onSuccess` is where a caller closes whatever the reload used to close for it.
 * Anything derived from props at mount — an editor, a picker, the next free day
 * number — has to be reset by hand now.
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
    // The whole action runs INSIDE the transition (a React 19 Action), so
    // `pending` stays true across the await and through the refresh that
    // follows it. Awaiting first and starting a transition afterwards would
    // leave a gap where the buttons are live but the data is stale.
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

  // Derived rather than cleared by hand: the moment the transition settles,
  // every button un-busies itself. Nothing has to remember to reset it, and
  // there is no setState-in-an-effect to cascade renders.
  return { busy: pending ? key : null, run };
}

// --------------------------------------------------------------- members

function Members({
  members,
  roster,
  onMsg,
}: {
  members: DisciplineMemberRow[];
  roster: StudentRow[];
  onMsg: (m: Msg) => void;
}) {
  const [query, setQuery] = useState("");
  // The full roster is rendered from the start; searching only replaces it.
  const [list, setList] = useState<StudentRow[]>(roster);
  const [searching, setSearching] = useState(false);
  const { busy, run } = useRunner(onMsg);

  const memberEmails = useMemo(
    () => new Set(members.map((m) => m.email?.toLowerCase()).filter(Boolean)),
    [members],
  );

  return (
    <div className="space-y-5">
      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">All students</h2>
          <span className="text-sm text-muted">{list.length} shown</span>
        </div>

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setSearching(true);
            onMsg(null);
            const res = await searchStudents(query);
            setSearching(false);
            if (res.ok) setList(res.users);
            else onMsg({ ok: false, text: res.error });
          }}
          className="flex gap-2"
        >
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by name or email…"
              className="admin-input w-full pl-9"
            />
          </div>
          <Button type="submit" disabled={searching}>
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
          </Button>
          {query && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setQuery("");
                setList(roster);
              }}
            >
              Clear
            </Button>
          )}
        </form>

        <ul className="max-h-[420px] divide-y divide-border overflow-y-auto rounded-lg border border-border">
          {list.map((u) => {
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
                    <>
                      <Check className="h-4 w-4" /> In
                    </>
                  ) : (
                    "Add"
                  )}
                </Button>
              </li>
            );
          })}
          {list.length === 0 && (
            <li className="px-3 py-4 text-sm text-muted">No students match that.</li>
          )}
        </ul>
      </Card>

      <div>
        <h2 className="mb-2 font-semibold">In the challenge ({members.length})</h2>
        {members.length === 0 ? (
          <p className="text-sm text-muted">Nobody yet — add someone from the list above.</p>
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
                      <span className="text-muted"> of {m.total_days}</span>
                    </span>
                    <span>
                      <span className="text-muted">Done </span>
                      <b>{m.completed}</b>
                      <span className="text-muted">/{m.total_days}</span>
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
                        run(`x-${m.user_id}`, () => revokeDiscipline(m.email!), `${m.email} removed.`);
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
    </div>
  );
}

// -------------------------------------------------------------- programme

function Programme({ days, onMsg }: { days: Day[]; onMsg: (m: Msg) => void }) {
  // Seeded from the props ONCE, at mount. Without the old page reload nothing
  // re-derives it, so the Add button below has to advance it itself — otherwise
  // the box still reads 5 after Day 5 is created and the next click fails with
  // "Day 5 already exists."
  const nextDay = (days.at(-1)?.day_number ?? 0) + 1;
  const [dayNumber, setDayNumber] = useState(String(nextDay));
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const { busy, run } = useRunner(onMsg);

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
              `Day ${dayNumber} added as a draft.`,
              () => {
                setDayNumber(String(Number(dayNumber) + 1));
                setTitle("");
                setInstructions("");
              },
            )
          }
        >
          {busy === "add" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add day"}
        </Button>
      </Card>

      {days.map((d, i) => (
        <DayCard
          key={d.id}
          day={d}
          first={i === 0}
          last={i === days.length - 1}
          onMsg={onMsg}
        />
      ))}

      {days.length === 0 && <p className="text-sm text-muted">No days yet. Add Day 1 above.</p>}

      {days.length > 0 && (
        <p className="text-sm text-muted">
          A new day is a <b>draft</b>: load its papers whenever you like, then press{" "}
          <b>Publish</b> to release it. Students never see a draft — not on the page, and not
          from a link to one of its papers.
        </p>
      )}
    </div>
  );
}

function DayCard({
  day,
  first,
  last,
  onMsg,
}: {
  day: Day;
  first: boolean;
  last: boolean;
  onMsg: (m: Msg) => void;
}) {
  const { busy, run } = useRunner(onMsg);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(day.title ?? "");
  const [instructions, setInstructions] = useState(day.instructions ?? "");
  const [mode, setMode] = useState<"none" | "pick" | "upload">("none");
  const [testQuery, setTestQuery] = useState("");
  const [tests, setTests] = useState<PickableTest[] | null>(null);

  async function openPicker() {
    setMode("pick");
    setTests(null);
    setTestQuery("");
    // Load the library straight away — the owner should not have to search to
    // see what exists.
    const res = await searchAttachableTests("");
    if (res.ok) setTests(res.tests);
    else onMsg({ ok: false, text: res.error });
  }

  return (
    // data-day survives the switch into edit mode, when the heading text that
    // would otherwise identify this card is replaced by the form.
    <Card
      className={cn("space-y-3", !day.published && "border-dashed border-warning/50")}
      data-day={day.day_number}
      data-published={day.published ? "true" : "false"}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="space-y-2">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title"
                className="admin-input w-full"
              />
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={2}
                placeholder="Instructions"
                className="admin-input w-full"
              />
              <div className="flex gap-2">
                <Button
                  disabled={busy === "save"}
                  onClick={() =>
                    run(
                      "save",
                      () => updateDisciplineDay(day.id, title, instructions),
                      `Day ${day.day_number} updated.`,
                      () => setEditing(false),
                    )
                  }
                >
                  Save
                </Button>
                <Button variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <>
              <p className="flex flex-wrap items-center gap-2 font-semibold">
                <span>
                  Day {day.day_number}
                  {day.title ? ` — ${day.title}` : ""}
                </span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-medium",
                    day.published
                      ? "bg-success/15 text-success"
                      : "bg-warning/15 text-warning",
                  )}
                >
                  {day.published ? "Published" : "Draft"}
                </span>
              </p>
              {day.instructions && (
                <p className="mt-0.5 whitespace-pre-line text-sm text-muted">{day.instructions}</p>
              )}
            </>
          )}
        </div>

        {!editing && (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              size="sm"
              variant={day.published ? "ghost" : "primary"}
              disabled={busy === "pub"}
              onClick={() => {
                if (
                  day.published &&
                  !confirm(
                    `Hide Day ${day.day_number} from students again? Nobody loses progress — the scores they have already recorded still count when you publish it back.`,
                  )
                ) {
                  return;
                }
                run(
                  "pub",
                  () => setDayPublished(day.id, !day.published),
                  day.published
                    ? `Day ${day.day_number} is a draft again.`
                    : `Day ${day.day_number} is live for your students.`,
                );
              }}
            >
              {busy === "pub" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : day.published ? (
                <>
                  <EyeOff className="h-4 w-4" /> Unpublish
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4" /> Publish
                </>
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={first || busy === "up"}
              onClick={() => run("up", () => moveDay(day.id, "up"), "Day moved.")}
              aria-label="Move day up"
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={last || busy === "down"}
              onClick={() => run("down", () => moveDay(day.id, "down"), "Day moved.")}
              aria-label="Move day down"
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy === "del"}
              onClick={() => {
                if (!confirm(`Delete Day ${day.day_number}? The tests themselves are kept.`)) return;
                run("del", () => deleteDisciplineDay(day.id), `Day ${day.day_number} deleted.`);
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      <ul className="space-y-1.5">
        {day.tests.map((t, i) => (
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
            <span className="flex shrink-0 items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                disabled={i === 0 || busy === `tu-${t.id}`}
                onClick={() => run(`tu-${t.id}`, () => moveTest(day.id, t.id, "up"), "Reordered.")}
                aria-label="Move test up"
              >
                <ChevronUp className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={i === day.tests.length - 1 || busy === `td-${t.id}`}
                onClick={() => run(`td-${t.id}`, () => moveTest(day.id, t.id, "down"), "Reordered.")}
                aria-label="Move test down"
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy === `t-${t.id}`}
                onClick={() => run(`t-${t.id}`, () => detachTest(day.id, t.id), "Test removed.")}
                aria-label="Remove test from day"
              >
                <X className="h-4 w-4" />
              </Button>
            </span>
          </li>
        ))}
        {day.tests.length === 0 && <li className="text-sm text-muted">No tests yet.</li>}
      </ul>

      {mode === "none" && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={openPicker}>
            <Plus className="h-4 w-4" /> Add from library
          </Button>
          <Button variant="outline" onClick={() => setMode("upload")}>
            <Upload className="h-4 w-4" /> Upload a new paper
          </Button>
        </div>
      )}

      {mode === "pick" && (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setTests(null);
              const res = await searchAttachableTests(testQuery);
              if (res.ok) setTests(res.tests);
              else onMsg({ ok: false, text: res.error });
            }}
            className="flex gap-2"
          >
            <input
              value={testQuery}
              onChange={(e) => setTestQuery(e.target.value)}
              placeholder="Filter by title…"
              className="admin-input w-full"
            />
            <Button type="submit">Search</Button>
            <Button variant="ghost" type="button" onClick={() => setMode("none")}>
              Cancel
            </Button>
          </form>
          {tests === null ? (
            <p className="flex items-center gap-2 py-3 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading tests…
            </p>
          ) : (
            <ul className="max-h-72 space-y-1 overflow-y-auto">
              {tests.map((t) => (
                <li key={t.id}>
                  <button
                    disabled={busy === `a-${t.id}`}
                    onClick={() =>
                      run(
                        `a-${t.id}`,
                        () => attachTest(day.id, t.id, day.tests.length),
                        `${t.title} attached to Day ${day.day_number}.`,
                        () => {
                          setMode("none");
                          setTests(null);
                          setTestQuery("");
                        },
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
              {tests.length === 0 && <li className="py-2 text-sm text-muted">No tests match.</li>}
            </ul>
          )}
        </div>
      )}

      {mode === "upload" && (
        <form
          className="space-y-3 rounded-lg border border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            // Captured before the await: `currentTarget` is null by the time an
            // async handler resumes, and the reset below needs the form.
            const form = e.currentTarget;
            const fd = new FormData(form);
            fd.set("dayId", day.id);
            // Through the same runner as every other action, so there is one
            // definition of "it worked — update the page".
            run(
              "upload",
              () => uploadDisciplineTest(fd),
              `Uploaded and attached to Day ${day.day_number}.`,
              () => {
                form.reset();
                setMode("none");
              },
            );
          }}
        >
          <p className="text-sm text-muted">
            The paper is saved as <b>Discipline only</b> — invisible in the public catalogue — and
            attached to this day straight away.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5 sm:col-span-2">
              <span className="text-sm font-medium">Title</span>
              <input name="title" required className="admin-input w-full" />
            </label>
            <label className="space-y-1.5">
              <span className="text-sm font-medium">Skill</span>
              <select name="skill" className="admin-input w-full" defaultValue="reading">
                <option value="reading">Reading</option>
                <option value="listening">Listening</option>
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-sm font-medium">Type</span>
              <select name="kind" className="admin-input w-full" defaultValue="single">
                <option value="single">Single passage / section</option>
                <option value="full">Full test</option>
              </select>
            </label>
            <label className="space-y-1.5 sm:col-span-2">
              <span className="text-sm font-medium">HTML file</span>
              <input
                name="file"
                type="file"
                accept=".html,text/html"
                required
                className="admin-input w-full pt-2"
              />
            </label>
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={busy === "upload"}>
              {busy === "upload" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Upload & attach"
              )}
            </Button>
            <Button variant="ghost" type="button" onClick={() => setMode("none")}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}

// --------------------------------------------------------------- progress

function scoreTone(raw: number | null, total: number | null): string {
  if (raw === null || total === null || total === 0) return "";
  const pct = raw / total;
  if (pct >= 0.8) return "bg-success/15 text-success";
  if (pct >= 0.6) return "bg-warning/15 text-warning";
  return "bg-danger/10 text-danger";
}

function Cell({ tests }: { tests: GridCellTest[] }) {
  if (tests.length === 0) return <span className="text-muted">—</span>;
  return (
    <span className="flex flex-col gap-0.5">
      {tests.map((t) => (
        <span
          key={t.testId}
          title={`${t.title}${t.at ? ` · ${new Date(t.at).toLocaleDateString()}` : " · not done"}${
            t.band !== null ? ` · band ${t.band}` : ""
          }`}
          className={cn(
            "rounded px-1.5 py-0.5 text-xs font-medium tabular-nums",
            t.raw === null ? "text-muted" : scoreTone(t.raw, t.total),
          )}
        >
          {t.raw === null ? "·" : `${t.raw}/${t.total ?? "?"}`}
        </span>
      ))}
    </span>
  );
}

/**
 * Hands the browser a file built on the server.
 *
 * The action returns base64 rather than a URL because there is nothing to host:
 * the document is generated per click, from the filters in force at that moment.
 * The object URL is revoked on the next tick — revoking it synchronously after
 * `click()` races the download in some browsers and yields an empty file.
 */
function downloadBase64(base64: string, filename: string, mime: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function Progress({ grid, onMsg }: { grid: ProgressGrid; onMsg: (m: Msg) => void }) {
  const [q, setQ] = useState("");
  const [onlyInactive, setOnlyInactive] = useState(false);
  const [onlyTrailing, setOnlyTrailing] = useState(false);
  const [onlyStrikes, setOnlyStrikes] = useState(false);
  const [dayFilter, setDayFilter] = useState<string>("all");
  // Off by default: the owner turns it on to take a screenshot, and a hidden
  // email would otherwise be a surprise on a page whose job is identifying
  // students. Deliberately not remembered between visits.
  const [hideEmails, setHideEmails] = useState(false);
  const [saving, setSaving] = useState(false);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return grid.rows.filter((r) => {
      if (needle && !`${r.name ?? ""} ${r.email ?? ""}`.toLowerCase().includes(needle)) return false;
      if (onlyInactive && !r.inactive) return false;
      if (onlyTrailing && !r.trailing) return false;
      if (onlyStrikes && r.strikes === 0) return false;
      if (dayFilter !== "all") {
        // "Day N" means: this student has not finished day N yet.
        const cells = r.cells[dayFilter] ?? [];
        const done = cells.length > 0 && cells.every((c) => c.raw !== null);
        if (done) return false;
      }
      return true;
    });
  }, [grid.rows, q, onlyInactive, onlyTrailing, onlyStrikes, dayFilter]);

  async function saveAsWord() {
    setSaving(true);
    onMsg(null);
    // The visible rows, in the order they are on screen; the server re-derives
    // every number from the database rather than trusting anything sent here.
    const res = await exportDisciplineReport(
      visible.map((r) => r.userId),
      {
        query: q,
        onlyInactive,
        onlyTrailing,
        onlyStrikes,
        dayNumber: grid.days.find((d) => d.id === dayFilter)?.day_number ?? null,
      },
    );
    setSaving(false);
    if (!res.ok) {
      onMsg({ ok: false, text: res.error });
      return;
    }
    downloadBase64(res.base64, res.filename, DOCX_MIME);
    onMsg({ ok: true, text: `Saved ${res.filename} — ${visible.length} students, no emails.` });
  }

  if (grid.rows.length === 0 || grid.days.length === 0) {
    return <p className="text-sm text-muted">Add students and days to see progress here.</p>;
  }

  const chip = (on: boolean) =>
    cn(
      "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
      on
        ? "border-primary/40 bg-primary/10 text-primary"
        : "border-border text-muted hover:bg-surface-2 hover:text-foreground",
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find a student…"
            className="admin-input w-full pl-9"
          />
        </div>
        <button className={chip(onlyInactive)} onClick={() => setOnlyInactive((v) => !v)}>
          Inactive
        </button>
        <button className={chip(onlyTrailing)} onClick={() => setOnlyTrailing((v) => !v)}>
          Trailing
        </button>
        <button className={chip(onlyStrikes)} onClick={() => setOnlyStrikes((v) => !v)}>
          Has strikes
        </button>
        <select
          value={dayFilter}
          onChange={(e) => setDayFilter(e.target.value)}
          className="admin-input"
        >
          <option value="all">Any day</option>
          {grid.days.map((d) => (
            <option key={d.id} value={d.id}>
              Not finished Day {d.day_number}
            </option>
          ))}
        </select>

        {/* For screenshots shared with the students' group. Display only — the
            search box above still matches on email, so a student can be found
            by address while their address is off screen. */}
        <button
          className={chip(hideEmails)}
          onClick={() => setHideEmails((v) => !v)}
          aria-pressed={hideEmails}
        >
          <span className="flex items-center gap-1.5">
            <AtSign className="h-4 w-4" />
            {hideEmails ? "Emails hidden" : "Hide emails"}
          </span>
        </button>

        <Button variant="outline" onClick={saveAsWord} disabled={saving || visible.length === 0}>
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <FileDown className="h-4 w-4" /> Save as Word
            </>
          )}
        </Button>
      </div>

      <p className="text-xs text-muted">
        Scores are each student&rsquo;s <b>first</b> attempt, the same one the rating ladder counts.
        <span className="mx-1.5">·</span>
        <b>Inactive</b> = nothing submitted in 3 days.
        <span className="mx-1.5">·</span>
        <b>Trailing</b> = behind the group median (Day {grid.medianDay}).
        <span className="mx-1.5">·</span>
        {visible.length} of {grid.rows.length} students shown.
      </p>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2/50 text-left">
              <th className="sticky left-0 z-10 bg-surface-2/50 px-3 py-2 font-medium backdrop-blur">
                Student
              </th>
              <th className="px-3 py-2 font-medium">Day</th>
              <th className="px-3 py-2 font-medium">Strikes</th>
              <th className="px-3 py-2 font-medium">Last seen</th>
              {grid.days.map((d) => (
                <th key={d.id} className="px-3 py-2 text-center font-medium" title={d.title ?? ""}>
                  D{d.day_number}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.userId} className="border-b border-border/60 last:border-0">
                <td className="sticky left-0 z-10 bg-surface px-3 py-2">
                  <p className="font-medium">{r.name || "Student"}</p>
                  {!hideEmails && <p className="text-xs text-muted">{r.email}</p>}
                  <span className="mt-0.5 flex gap-1">
                    {r.inactive && (
                      <span className="rounded-full bg-danger/10 px-1.5 py-0.5 text-[11px] font-medium text-danger">
                        Inactive
                      </span>
                    )}
                    {r.trailing && (
                      <span className="rounded-full bg-warning/15 px-1.5 py-0.5 text-[11px] font-medium text-warning">
                        Trailing
                      </span>
                    )}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                  {r.currentDay}
                  <span className="text-muted"> of {r.totalDays}</span>
                </td>
                <td
                  className={cn(
                    "px-3 py-2 tabular-nums",
                    r.strikes >= STRIKE_LIMIT && "font-semibold text-danger",
                  )}
                >
                  {r.strikes}/{STRIKE_LIMIT}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-muted">
                  {r.lastActivity ? new Date(r.lastActivity).toLocaleDateString() : "never"}
                </td>
                {grid.days.map((d) => (
                  <td key={d.id} className="px-2 py-2 text-center">
                    <Cell tests={r.cells[d.id] ?? []} />
                  </td>
                ))}
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={4 + grid.days.length} className="px-3 py-6 text-center text-muted">
                  No students match those filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
