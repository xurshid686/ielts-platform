"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { TablesUpdate } from "@/types/database";
import { QUESTION_TYPES } from "@/lib/ielts/question-types";
import { EDITABLE_TRACKS, canRetrack } from "@/lib/admin/stats-shared";

// Editing a test's labels after upload (admin panel v2, owner 2026-11-27).
// Before this, rename and delete were the only edits; tier, track, passage
// and question types were fixed at upload.
//
// Writes go through the admin's SESSION client under the `tests_admin_all`
// RLS policy, like renameTest — and, like it, with no .select() chained: a
// RETURNING clause needs column SELECT privileges that 0034 revoked.

type Result = { ok: true; changed?: number } | { ok: false; error: string };

async function gate() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in.", supabase };
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if ((data as { role?: string } | null)?.role !== "admin") return { ok: false as const, error: "Admins only.", supabase };
  return { ok: true as const, supabase };
}

const UUID = /^[0-9a-f-]{36}$/i;

export type TestMetaPatch = {
  tier?: "free" | "premium";
  track?: string;
  passage?: number | null;
  question_types?: string[];
};

export async function updateTestMeta(id: string, patch: TestMetaPatch): Promise<Result> {
  const g = await gate();
  if (!g.ok) return g;
  if (!UUID.test(id)) return { ok: false, error: "Bad test id." };

  const { data: row, error: readErr } = await g.supabase
    .from("tests")
    .select("id, skill, track")
    .eq("id", id)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  const test = row as { id: string; skill: "reading" | "listening"; track: string | null } | null;
  if (!test) return { ok: false, error: "Test not found." };

  const update: TablesUpdate<"tests"> = {};
  if (patch.tier !== undefined) {
    if (patch.tier !== "free" && patch.tier !== "premium") return { ok: false, error: "Tier must be free or premium." };
    update.tier = patch.tier;
  }
  if (patch.track !== undefined && patch.track !== (test.track ?? "regular")) {
    if (!canRetrack(test.track, patch.track)) {
      return {
        ok: false,
        error: `Only ${EDITABLE_TRACKS.join(" / ")} papers can be moved here. Discipline and mock papers are managed on their own pages.`,
      };
    }
    update.track = patch.track;
  }
  if (patch.passage !== undefined) {
    if (patch.passage !== null && ![1, 2, 3, 4].includes(patch.passage)) return { ok: false, error: "Passage must be 1–4." };
    update.passage = patch.passage;
  }
  if (patch.question_types !== undefined) {
    const allowed = new Set(QUESTION_TYPES[test.skill] ?? []);
    const clean = [...new Set(patch.question_types)].filter((t) => allowed.has(t));
    update.question_types = clean;
  }
  if (Object.keys(update).length === 0) return { ok: true, changed: 0 };

  const { error } = await g.supabase.from("tests").update(update).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/tests");
  revalidatePath(`/${test.skill}`);
  revalidatePath(`/${test.skill}/${id}`);
  return { ok: true, changed: 1 };
}

/** Set many tests Free or Premium at once. Discipline and mock papers are skipped. */
export async function bulkSetTier(ids: string[], tier: "free" | "premium"): Promise<Result> {
  const g = await gate();
  if (!g.ok) return g;
  if (tier !== "free" && tier !== "premium") return { ok: false, error: "Tier must be free or premium." };
  const clean = [...new Set(ids)].filter((x) => UUID.test(x)).slice(0, 1000);
  if (clean.length === 0) return { ok: false, error: "Select at least one test." };

  let changed = 0;
  // Batches of 100 keep the `in.(…)` list well inside a URL.
  for (let i = 0; i < clean.length; i += 100) {
    const batch = clean.slice(i, i + 100);
    const { error, count } = await g.supabase
      .from("tests")
      .update({ tier }, { count: "exact" })
      .in("id", batch)
      .in("track", [...EDITABLE_TRACKS]);
    if (error) return { ok: false, error: `${error.message} (${changed} changed before the error)` };
    changed += count ?? 0;
  }

  revalidatePath("/admin/tests");
  revalidatePath("/reading");
  revalidatePath("/listening");
  return { ok: true, changed };
}
