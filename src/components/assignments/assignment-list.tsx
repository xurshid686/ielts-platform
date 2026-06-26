"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  Headphones,
  PenLine,
  Mic,
  ClipboardList,
  CheckCircle2,
  CircleDot,
  CircleDashed,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { startAssignment } from "@/app/actions/assignments";
import type { Skill, AssignmentStatus } from "@/types/database";

export type StudentAssignment = {
  id: string;
  skill: Skill;
  title: string;
  due_date: string | null;
  status: AssignmentStatus;
  href: string; // where "Open" takes the student
  band: number | null; // their score once submitted
};

const SKILL_META: Record<Skill, { label: string; icon: typeof BookOpen }> = {
  reading: { label: "Reading", icon: BookOpen },
  listening: { label: "Listening", icon: Headphones },
  writing: { label: "Writing", icon: PenLine },
  speaking: { label: "Speaking", icon: Mic },
};

const STATUS_META: Record<
  AssignmentStatus,
  { label: string; icon: typeof CircleDashed; className: string }
> = {
  assigned: { label: "To do", icon: CircleDashed, className: "text-muted" },
  in_progress: {
    label: "In progress",
    icon: CircleDot,
    className: "text-amber-600 dark:text-amber-400",
  },
  submitted: { label: "Submitted", icon: CheckCircle2, className: "text-success" },
};

function Group({ title, items }: { title: string; items: StudentAssignment[] }) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="space-y-3">
        {items.map((a) => (
          <AssignmentCard key={a.id} a={a} />
        ))}
      </div>
    </section>
  );
}

function AssignmentCard({ a }: { a: StudentAssignment }) {
  const router = useRouter();
  const [opening, setOpening] = useState(false);
  const skill = SKILL_META[a.skill];
  const status = STATUS_META[a.status];
  const SkillIcon = skill.icon;
  const StatusIcon = status.icon;
  const overdue =
    a.due_date && a.status !== "submitted" && new Date(a.due_date) < new Date(new Date().toDateString());

  async function open() {
    setOpening(true);
    // Move it to in_progress (no-op if already started/submitted), then go.
    await startAssignment(a.id);
    router.push(a.href);
  }

  return (
    <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <SkillIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate font-medium">{a.title}</p>
          <p className="text-xs text-muted">
            {skill.label}
            {a.due_date ? (
              <span className={overdue ? "text-danger" : ""}>
                {" · "}due {new Date(a.due_date).toLocaleDateString()}
                {overdue ? " (overdue)" : ""}
              </span>
            ) : (
              " · no due date"
            )}
            {a.band != null ? ` · Band ${a.band}` : ""}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 self-end sm:self-auto">
        <span className={`inline-flex items-center gap-1 text-xs font-medium ${status.className}`}>
          <StatusIcon className="h-3.5 w-3.5" /> {status.label}
        </span>
        <button
          onClick={open}
          disabled={opening}
          className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-[var(--shadow-primary)] disabled:opacity-60"
        >
          {opening ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              {a.status === "submitted" ? "Review" : a.status === "in_progress" ? "Continue" : "Start"}
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </div>
    </Card>
  );
}

export function AssignmentList({ assignments }: { assignments: StudentAssignment[] }) {
  if (assignments.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-10 text-center">
        <ClipboardList className="mx-auto h-8 w-8 text-muted" />
        <p className="mt-3 text-sm text-muted">
          No assignments yet. Your teacher will add tasks here.
        </p>
      </div>
    );
  }

  const todo = assignments.filter((a) => a.status === "assigned");
  const inProgress = assignments.filter((a) => a.status === "in_progress");
  const done = assignments.filter((a) => a.status === "submitted");

  return (
    <div className="space-y-8">
      <Group title="To do" items={todo} />
      <Group title="In progress" items={inProgress} />
      <Group title="Submitted" items={done} />
    </div>
  );
}
