import { redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  AssignmentList,
  type StudentAssignment,
} from "@/components/assignments/assignment-list";
import type { Skill, AssignmentStatus } from "@/types/database";

export const metadata = { title: "Assignments" };

// Where "Open" sends the student for each section.
function hrefFor(a: {
  skill: Skill;
  test_id: string | null;
  speaking_question_id: string | null;
}): string {
  switch (a.skill) {
    case "reading":
      return a.test_id ? `/reading/${a.test_id}` : "/reading";
    case "listening":
      return a.test_id ? `/listening/${a.test_id}` : "/listening";
    case "speaking":
      return a.speaking_question_id
        ? `/speaking/questions/${a.speaking_question_id}`
        : "/speaking";
    case "writing":
      return "/writing";
  }
}

export default async function AssignmentsPage() {
  const profile = await requireProfile();
  if (!profile.is_my_student) redirect("/dashboard");

  const supabase = await createClient();
  const { data } = await supabase
    .from("assignment_targets")
    .select(
      `status, started_at, submitted_at,
       result:results(band),
       speaking:speaking_submissions(score),
       writing:writing_submissions(score),
       assignment:assignments(id, skill, title, due_date, test_id, speaking_question_id, writing_prompt, created_at)`,
    )
    .eq("user_id", profile.id);

  type Embedded<T> = T | T[] | null;
  const one = <T,>(v: Embedded<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

  type Raw = {
    status: AssignmentStatus;
    result: Embedded<{ band: number | null }>;
    speaking: Embedded<{ score: number | null }>;
    writing: Embedded<{ score: number | null }>;
    assignment: Embedded<{
      id: string;
      skill: Skill;
      title: string;
      due_date: string | null;
      test_id: string | null;
      speaking_question_id: string | null;
      created_at: string;
    }>;
  };

  const assignments: StudentAssignment[] = ((data ?? []) as unknown as Raw[])
    .map((r) => {
      const a = one(r.assignment);
      if (!a) return null;
      return {
        id: a.id,
        skill: a.skill,
        title: a.title,
        due_date: a.due_date,
        status: r.status,
        href: hrefFor(a),
        band: one(r.result)?.band ?? one(r.speaking)?.score ?? one(r.writing)?.score ?? null,
        _createdAt: a.created_at,
      } as StudentAssignment & { _createdAt: string };
    })
    .filter((x): x is StudentAssignment & { _createdAt: string } => x !== null)
    .sort((a, b) => b._createdAt.localeCompare(a._createdAt));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <ClipboardList className="h-6 w-6 text-primary" /> Assignments
        </h1>
        <p className="text-muted">Tasks your teacher has set for you.</p>
      </div>

      <AssignmentList assignments={assignments} />
    </div>
  );
}
