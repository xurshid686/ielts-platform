import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AdminAssignments, type AssignmentView, type StudentOption } from "@/components/admin/admin-assignments";

export default async function AdminAssignmentsPage() {
  await requireAdmin();
  const supabase = await createClient();

  const [studentsRes, testsRes, questionsRes, assignmentsRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, name, email")
      .eq("is_my_student", true)
      .order("name", { ascending: true }),
    supabase.from("tests").select("id, title, skill").order("created_at", { ascending: false }),
    supabase
      .from("speaking_questions")
      .select("id, part, title, number")
      .order("part", { ascending: true }),
    supabase
      .from("assignments")
      .select(
        `id, skill, title, due_date, created_at, test_id, speaking_question_id, writing_prompt,
         targets:assignment_targets(
           user_id, status, started_at, submitted_at,
           result:results(band, raw, total),
           speaking:speaking_submissions(score),
           writing:writing_submissions(score)
         )`,
      )
      .order("created_at", { ascending: false }),
  ]);

  const students = (studentsRes.data ?? []) as StudentOption[];
  const tests = (testsRes.data ?? []) as { id: string; title: string; skill: string }[];
  const questions = (questionsRes.data ?? []) as {
    id: string;
    part: number;
    title: string;
    number: string | null;
  }[];

  // Flatten the embedded score refs into a single nullable band per target.
  type RawTarget = {
    user_id: string;
    status: "assigned" | "in_progress" | "submitted";
    started_at: string | null;
    submitted_at: string | null;
    result: { band: number | null } | { band: number | null }[] | null;
    speaking: { score: number | null } | { score: number | null }[] | null;
    writing: { score: number | null } | { score: number | null }[] | null;
  };
  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

  const assignments = (
    (assignmentsRes.data ?? []) as unknown as (Omit<AssignmentView, "targets"> & {
      targets: RawTarget[];
    })[]
  ).map((a) => ({
    ...a,
    targets: (a.targets ?? []).map((t) => ({
      user_id: t.user_id,
      status: t.status,
      started_at: t.started_at,
      submitted_at: t.submitted_at,
      score:
        one(t.result)?.band ?? one(t.speaking)?.score ?? one(t.writing)?.score ?? null,
    })),
  })) as AssignmentView[];

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin" className="text-sm text-muted hover:text-foreground">
          ← Admin
        </Link>
        <h1 className="text-2xl font-bold">Assignments</h1>
        <p className="text-muted">
          Give your students a task in any section and track who is doing it.
        </p>
      </div>

      {students.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">
          You have no students yet. Mark someone as a “My student” in{" "}
          <Link href="/admin/members" className="text-primary underline">
            Members
          </Link>{" "}
          first.
        </div>
      ) : (
        <AdminAssignments
          students={students}
          tests={tests}
          questions={questions}
          assignments={assignments}
        />
      )}
    </div>
  );
}
