"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { TeacherFeedback } from "@/types/database";

async function assertAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, ok: false as const, error: "Not signed in." };

  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if ((data as { role?: string } | null)?.role !== "admin") {
    return { supabase, user, ok: false as const, error: "Admins only." };
  }
  return { supabase, user, ok: true as const, error: null };
}

export type SendFeedbackInput = {
  studentId: string;
  body: string;
  assignmentId?: string | null;
  skill?: string | null;
  title?: string | null;
};

export type ActionResult = { ok: true } | { ok: false; error: string };

// Admin-only: send written feedback to a My-student. The DB function is itself
// admin-gated and also drops a notification for the student.
export async function sendFeedback(input: SendFeedbackInput): Promise<ActionResult> {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const { supabase } = gate;

  if (!input.body.trim()) return { ok: false, error: "Write some feedback first." };

  const { error } = await supabase.rpc("admin_send_feedback", {
    p_student: input.studentId,
    p_body: input.body,
    p_assignment_id: input.assignmentId ?? null,
    p_skill: input.skill ?? null,
    p_title: input.title ?? null,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/my-students");
  revalidatePath("/admin/assignments");
  revalidatePath("/", "layout");
  return { ok: true };
}

// Admin-only: the feedback already sent to a given student (newest first).
export async function listStudentFeedback(
  studentId: string,
): Promise<{ ok: true; feedback: TeacherFeedback[] } | { ok: false; error: string }> {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const { supabase } = gate;

  const { data, error } = await supabase
    .from("teacher_feedback")
    .select("*")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return { ok: false, error: error.message };
  return { ok: true, feedback: (data ?? []) as TeacherFeedback[] };
}

// Student-side: mark one feedback item read (RLS limits this to the caller's own).
export async function markFeedbackRead(id: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  await supabase
    .from("teacher_feedback")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("student_id", user.id)
    .is("read_at", null);
  revalidatePath("/", "layout");
  return { ok: true };
}
