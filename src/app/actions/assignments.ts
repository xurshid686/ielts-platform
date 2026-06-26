"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import type { Skill } from "@/types/database";

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

export type CreateAssignmentInput = {
  skill: Skill;
  testId?: string | null;
  speakingQuestionId?: string | null;
  writingPrompt?: string | null;
  title: string;
  dueDate?: string | null; // ISO date or null
  studentIds: string[];
};

export type ActionResult = { ok: true } | { ok: false; error: string };

// Create an assignment and deliver it to the selected My-students.
export async function createAssignment(input: CreateAssignmentInput): Promise<ActionResult> {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const { supabase, user } = gate;

  const title = input.title.trim();
  if (!title) return { ok: false, error: "Give the assignment a title." };
  if (!input.studentIds.length) return { ok: false, error: "Pick at least one student." };

  // Validate the section-specific reference up front (the DB CHECK mirrors this).
  const row: Record<string, unknown> = {
    created_by: user!.id,
    skill: input.skill,
    title,
    due_date: input.dueDate || null,
    test_id: null,
    speaking_question_id: null,
    writing_prompt: null,
  };
  if (input.skill === "reading" || input.skill === "listening") {
    if (!input.testId) return { ok: false, error: "Choose a test for this section." };
    row.test_id = input.testId;
  } else if (input.skill === "speaking") {
    if (!input.speakingQuestionId && !input.writingPrompt?.trim())
      return { ok: false, error: "Choose a speaking question or write a prompt." };
    row.speaking_question_id = input.speakingQuestionId || null;
    row.writing_prompt = input.writingPrompt?.trim() || null;
  } else {
    // writing
    if (!input.writingPrompt?.trim()) return { ok: false, error: "Write a prompt for the essay." };
    row.writing_prompt = input.writingPrompt.trim();
  }

  const { data: created, error: insErr } = await supabase
    .from("assignments")
    .insert(row)
    .select("id")
    .single();
  if (insErr || !created) {
    return { ok: false, error: insErr?.message ?? "Could not create the assignment." };
  }

  const assignmentId = (created as { id: string }).id;
  const targets = input.studentIds.map((uid) => ({
    assignment_id: assignmentId,
    user_id: uid,
  }));
  const { error: tErr } = await supabase.from("assignment_targets").insert(targets);
  if (tErr) {
    // Roll back the orphaned assignment so we don't leave a target-less row.
    await supabase.from("assignments").delete().eq("id", assignmentId);
    return { ok: false, error: tErr.message };
  }

  revalidatePath("/admin/assignments");
  return { ok: true };
}

export async function deleteAssignment(id: string): Promise<ActionResult> {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const { supabase } = gate;

  const { error } = await supabase.from("assignments").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/assignments");
  return { ok: true };
}

// Student opens an assignment -> mark it in_progress (no-op if already started).
export async function startAssignment(assignmentId: string): Promise<ActionResult> {
  const profile = await requireProfile();
  if (!profile.is_my_student) return { ok: false, error: "Not available for your account." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("start_assignment", { p_assignment_id: assignmentId });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/assignments");
  return { ok: true };
}
