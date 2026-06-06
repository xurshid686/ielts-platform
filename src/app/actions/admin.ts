"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function assertAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, ok: false as const, error: "Not signed in." };

  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const profile = data as { role?: string } | null;
  if (profile?.role !== "admin") {
    return { supabase, user, ok: false as const, error: "Admins only." };
  }
  return { supabase, user, ok: true as const, error: null };
}

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function uploadTest(formData: FormData): Promise<ActionResult> {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const { supabase, user } = gate;

  const title = String(formData.get("title") || "").trim();
  const skill = String(formData.get("skill") || "");
  const level = String(formData.get("level") || "").trim() || null;
  const passageRaw = String(formData.get("passage") || "").trim();
  const passage = skill === "reading" && passageRaw ? Number(passageRaw) : null;
  const file = formData.get("file") as File | null;

  if (!title) return { ok: false, error: "Title is required." };
  if (skill !== "reading" && skill !== "listening")
    return { ok: false, error: "Skill must be reading or listening." };
  if (!file || file.size === 0) return { ok: false, error: "Please choose an HTML file." };
  if (!file.name.toLowerCase().endsWith(".html") && file.type !== "text/html")
    return { ok: false, error: "File must be a .html file." };

  const path = `${skill}/${crypto.randomUUID()}.html`;

  const { error: upErr } = await supabase.storage.from("tests").upload(path, file, {
    contentType: "text/html",
    upsert: false,
  });
  if (upErr) return { ok: false, error: `Upload failed: ${upErr.message}` };

  const {
    data: { publicUrl },
  } = supabase.storage.from("tests").getPublicUrl(path);

  const { error: insErr } = await supabase.from("tests").insert({
    title,
    skill,
    level,
    passage,
    file_url: publicUrl,
    file_path: path,
    created_by: user!.id,
  });
  if (insErr) {
    // best-effort cleanup of the orphaned file
    await supabase.storage.from("tests").remove([path]);
    return { ok: false, error: `Saving test failed: ${insErr.message}` };
  }

  revalidatePath("/admin/tests");
  revalidatePath(`/${skill}`);
  return { ok: true };
}

export async function deleteTest(id: string): Promise<ActionResult> {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const { supabase } = gate;

  const { data: testRow } = await supabase
    .from("tests")
    .select("file_path, skill")
    .eq("id", id)
    .single();

  const test = testRow as { file_path?: string; skill?: string } | null;
  if (test?.file_path) {
    await supabase.storage.from("tests").remove([test.file_path]);
  }
  const { error } = await supabase.from("tests").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/tests");
  if (test?.skill) revalidatePath(`/${test.skill}`);
  return { ok: true };
}
