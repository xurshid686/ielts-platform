"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Plus,
  Trash2,
  ClipboardList,
  BookOpen,
  Headphones,
  PenLine,
  Mic,
  CheckCircle2,
  CircleDashed,
  CircleDot,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createAssignment, deleteAssignment } from "@/app/actions/assignments";
import type { Skill, AssignmentStatus } from "@/types/database";

export type StudentOption = { id: string; name: string | null; email: string | null };

export type AssignmentView = {
  id: string;
  skill: Skill;
  title: string;
  due_date: string | null;
  created_at: string;
  test_id: string | null;
  speaking_question_id: string | null;
  writing_prompt: string | null;
  targets: {
    user_id: string;
    status: AssignmentStatus;
    started_at: string | null;
    submitted_at: string | null;
    score: number | null;
  }[];
};

const SKILLS: { value: Skill; label: string; icon: typeof BookOpen }[] = [
  { value: "reading", label: "Reading", icon: BookOpen },
  { value: "listening", label: "Listening", icon: Headphones },
  { value: "writing", label: "Writing", icon: PenLine },
  { value: "speaking", label: "Speaking", icon: Mic },
];

const STATUS_META: Record<
  AssignmentStatus,
  { label: string; icon: typeof CircleDashed; className: string }
> = {
  assigned: { label: "Not started", icon: CircleDashed, className: "text-muted" },
  in_progress: { label: "In progress", icon: CircleDot, className: "text-amber-600 dark:text-amber-400" },
  submitted: { label: "Submitted", icon: CheckCircle2, className: "text-success" },
};

export function AdminAssignments({
  students,
  tests,
  questions,
  assignments,
}: {
  students: StudentOption[];
  tests: { id: string; title: string; skill: string }[];
  questions: { id: string; part: number; title: string; number: string | null }[];
  assignments: AssignmentView[];
}) {
  const router = useRouter();
  const [skill, setSkill] = useState<Skill>("reading");
  const [title, setTitle] = useState("");
  const [testId, setTestId] = useState("");
  const [questionId, setQuestionId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const nameOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of students) m.set(s.id, s.name || s.email || "Student");
    return (id: string) => m.get(id) ?? "Student";
  }, [students]);

  const sectionTests = useMemo(
    () => tests.filter((t) => t.skill === skill),
    [tests, skill],
  );

  function toggleStudent(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function resetForm() {
    setTitle("");
    setTestId("");
    setQuestionId("");
    setPrompt("");
    setDueDate("");
    setSelected([]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    const res = await createAssignment({
      skill,
      title,
      testId: skill === "reading" || skill === "listening" ? testId : null,
      speakingQuestionId: skill === "speaking" ? questionId || null : null,
      writingPrompt:
        skill === "writing" ? prompt : skill === "speaking" && !questionId ? prompt : null,
      dueDate: dueDate || null,
      studentIds: selected,
    });
    setSaving(false);
    if (!res.ok) {
      setMsg({ ok: false, text: res.error });
      return;
    }
    setMsg({ ok: true, text: "Assignment created and delivered." });
    resetForm();
    router.refresh();
  }

  async function remove(id: string) {
    setDeletingId(id);
    setMsg(null);
    const res = await deleteAssignment(id);
    setDeletingId(null);
    if (!res.ok) {
      setMsg({ ok: false, text: res.error });
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-8">
      {/* Create form */}
      <Card>
        <h2 className="flex items-center gap-2 font-semibold">
          <Plus className="h-4 w-4 text-primary" /> New assignment
        </h2>

        <form onSubmit={submit} className="mt-4 space-y-4">
          {/* Section */}
          <div className="flex flex-wrap gap-2">
            {SKILLS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setSkill(value)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium ${
                  skill === value
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border text-muted hover:bg-surface-2"
                }`}
              >
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>

          {/* Section-specific picker */}
          {(skill === "reading" || skill === "listening") && (
            <label className="block text-sm">
              <span className="mb-1 block text-muted">Test</span>
              <select
                value={testId}
                onChange={(e) => setTestId(e.target.value)}
                className="h-10 w-full rounded-lg border border-border bg-surface-2 px-3 text-sm outline-none focus:border-primary/40"
              >
                <option value="">Choose a {skill} test…</option>
                {sectionTests.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
              {sectionTests.length === 0 && (
                <span className="mt-1 block text-xs text-muted">
                  No {skill} tests uploaded yet.
                </span>
              )}
            </label>
          )}

          {skill === "speaking" && (
            <div className="space-y-2">
              <label className="block text-sm">
                <span className="mb-1 block text-muted">Question from the bank (optional)</span>
                <select
                  value={questionId}
                  onChange={(e) => setQuestionId(e.target.value)}
                  className="h-10 w-full rounded-lg border border-border bg-surface-2 px-3 text-sm outline-none focus:border-primary/40"
                >
                  <option value="">— None (use a custom prompt below) —</option>
                  {questions.map((q) => (
                    <option key={q.id} value={q.id}>
                      Part {q.part}
                      {q.number ? ` · ${q.number}` : ""} · {q.title}
                    </option>
                  ))}
                </select>
              </label>
              {!questionId && (
                <label className="block text-sm">
                  <span className="mb-1 block text-muted">Custom prompt</span>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    rows={2}
                    placeholder="e.g. Describe a place you would like to visit."
                    className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary/40"
                  />
                </label>
              )}
            </div>
          )}

          {skill === "writing" && (
            <label className="block text-sm">
              <span className="mb-1 block text-muted">Essay prompt</span>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={3}
                placeholder="Paste the Task 1 or Task 2 prompt…"
                className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary/40"
              />
            </label>
          )}

          {/* Title + due date */}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-muted">Title</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Reading practice #3"
                className="h-10 w-full rounded-lg border border-border bg-surface-2 px-3 text-sm outline-none focus:border-primary/40"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted">Due date (optional)</span>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="h-10 w-full rounded-lg border border-border bg-surface-2 px-3 text-sm outline-none focus:border-primary/40"
              />
            </label>
          </div>

          {/* Students */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-sm text-muted">Assign to</span>
              <button
                type="button"
                onClick={() =>
                  setSelected(
                    selected.length === students.length ? [] : students.map((s) => s.id),
                  )
                }
                className="text-xs text-primary hover:underline"
              >
                {selected.length === students.length ? "Clear all" : "Select all"}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {students.map((s) => {
                const on = selected.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleStudent(s.id)}
                    className={`rounded-full border px-3 py-1.5 text-sm ${
                      on
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border text-muted hover:bg-surface-2"
                    }`}
                  >
                    {s.name || s.email}
                  </button>
                );
              })}
            </div>
          </div>

          {msg && (
            <p className={`text-sm ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</p>
          )}

          <Button type="submit" disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create assignment
          </Button>
        </form>
      </Card>

      {/* Tracker */}
      <section className="space-y-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <ClipboardList className="h-5 w-5 text-primary" /> Given assignments
        </h2>

        {assignments.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">
            No assignments yet.
          </p>
        ) : (
          assignments.map((a) => {
            const Icon = SKILLS.find((s) => s.value === a.skill)?.icon ?? ClipboardList;
            const done = a.targets.filter((t) => t.status === "submitted").length;
            return (
              <Card key={a.id} className="p-0">
                <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium">
                      <Icon className="h-4 w-4 text-primary" /> {a.title}
                    </p>
                    <p className="text-xs text-muted">
                      {a.skill[0].toUpperCase() + a.skill.slice(1)} ·{" "}
                      {done}/{a.targets.length} submitted
                      {a.due_date
                        ? ` · due ${new Date(a.due_date).toLocaleDateString()}`
                        : " · no due date"}
                    </p>
                  </div>
                  <button
                    onClick={() => remove(a.id)}
                    disabled={deletingId === a.id}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-danger/30 px-2.5 text-xs font-medium text-danger hover:bg-danger/10 disabled:opacity-50"
                  >
                    {deletingId === a.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                    Delete
                  </button>
                </div>
                <ul className="divide-y divide-border">
                  {a.targets.map((t) => {
                    const meta = STATUS_META[t.status];
                    const StatusIcon = meta.icon;
                    return (
                      <li
                        key={t.user_id}
                        className="flex items-center justify-between px-5 py-2.5 text-sm"
                      >
                        <span className="truncate">{nameOf(t.user_id)}</span>
                        <span className="flex items-center gap-3">
                          {t.score != null && (
                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                              Band {t.score}
                            </span>
                          )}
                          <span className={`inline-flex items-center gap-1 ${meta.className}`}>
                            <StatusIcon className="h-3.5 w-3.5" /> {meta.label}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            );
          })
        )}
      </section>
    </div>
  );
}
