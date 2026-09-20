"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  cancelJob,
  deleteJob,
  publishJob,
  submitJob,
  type PublishResult,
  type SubmitResult,
} from "@/lib/converter";
import type { Tier, Track } from "@/lib/tests/create";

// The owner gate for the PDF → CDI converter (migration 0059).
//
// src/lib/converter.ts is authorisation-free on purpose — it runs under the
// service role and bypasses RLS — so every action here gates FIRST. The page
// is owner-only as well (requireOwner in its layout position), but a server
// action is reachable by anyone who can guess its id: the page gate is not the
// security boundary, this is.

type Gate =
  | { ok: true; userId: string }
  | { ok: false; error: string };

async function assertOwner(): Promise<Gate> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const { data } = await supabase
    .from("profiles")
    .select("role, is_owner")
    .eq("id", user.id)
    .single();
  const profile = data as { role?: string; is_owner?: boolean } | null;
  if (profile?.role !== "admin" || !profile?.is_owner) {
    return { ok: false, error: "Owner only." };
  }
  return { ok: true, userId: user.id };
}

export async function queueConversion(formData: FormData): Promise<SubmitResult> {
  const gate = await assertOwner();
  if (!gate.ok) return { ok: false, error: gate.error };

  const file = formData.get("file") as File | null;
  const title = String(formData.get("title") || "").trim();
  const testId = String(formData.get("testId") || "").trim();

  if (!file || file.size === 0) return { ok: false, error: "Choose a PDF." };
  if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
    return { ok: false, error: "That is not a PDF." };
  }

  const result = await submitJob({ testId, title, pdf: file, createdBy: gate.userId });
  if (result.ok) revalidatePath("/admin/converter");
  return result;
}

export async function cancelConversion(id: string) {
  const gate = await assertOwner();
  if (!gate.ok) return { ok: false, error: gate.error };
  const out = await cancelJob(id);
  if (out.ok) revalidatePath("/admin/converter");
  return out;
}

export async function deleteConversion(id: string) {
  const gate = await assertOwner();
  if (!gate.ok) return { ok: false, error: gate.error };
  const out = await deleteJob(id);
  if (out.ok) revalidatePath("/admin/converter");
  return out;
}

export async function publishConversion(formData: FormData): Promise<PublishResult> {
  const gate = await assertOwner();
  if (!gate.ok) return { ok: false, error: gate.error };

  const id = String(formData.get("id") || "");
  const tier = String(formData.get("tier") || "free") as Tier;
  const track = String(formData.get("track") || "regular") as Track;
  const levelRaw = String(formData.get("level") || "").trim();

  if (!id) return { ok: false, error: "No job." };
  if (tier !== "free" && tier !== "premium") return { ok: false, error: "Bad tier." };

  const out = await publishJob({
    id,
    tier,
    track,
    level: levelRaw || null,
    createdBy: gate.userId,
  });
  if (out.ok) {
    revalidatePath("/admin/converter");
    revalidatePath("/admin/tests");
    revalidatePath("/reading");
  }
  return out;
}
