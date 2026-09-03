"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rows } from "@/types/database";
import { createTestFromHtml, type Track } from "@/lib/tests/create";
import { sendAdminPromotionEmail } from "@/lib/email/send";

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
  const { user } = gate;

  const title = String(formData.get("title") || "").trim();
  const skill = String(formData.get("skill") || "");
  const kind = String(formData.get("kind") || "single") === "full" ? "full" : "single";
  const tier = String(formData.get("tier") || "free") === "premium" ? "premium" : "free";
  const questionTypes = formData
    .getAll("question_types")
    .map((v) => String(v))
    .filter(Boolean);
  const level = String(formData.get("level") || "").trim() || null;
  const trackRaw = String(formData.get("track") || "regular");
  const track = ["regular", "pre_ielts", "intro", "discipline"].includes(trackRaw)
    ? trackRaw
    : "regular";
  const passageRaw = String(formData.get("passage") || "").trim();
  // A passage number only applies to a single reading passage.
  const passage =
    skill === "reading" && kind === "single" && passageRaw ? Number(passageRaw) : null;
  const file = formData.get("file") as File | null;

  if (!title) return { ok: false, error: "Title is required." };
  if (skill !== "reading" && skill !== "listening")
    return { ok: false, error: "Skill must be reading or listening." };
  if (!file || file.size === 0) return { ok: false, error: "Please choose an HTML file." };
  if (!file.name.toLowerCase().endsWith(".html") && file.type !== "text/html")
    return { ok: false, error: "File must be a .html file." };

  // Reading the key, uploading the object and inserting the row now live in
  // createTestFromHtml() so the Telegram bot publishes a paper through exactly
  // the same code — including the refusal when a file carries no answer key,
  // which is the check that stops a test shipping its own answers to the
  // browser. This action keeps what is genuinely its own: the admin gate, the
  // form parsing above, and the cache revalidation below.
  const created = await createTestFromHtml({
    title,
    skill,
    kind,
    tier,
    track: track as Track,
    questionTypes,
    level,
    passage,
    html: await file.text(),
    createdBy: user!.id,
  });
  if (!created.ok) return { ok: false, error: created.error };

  revalidatePath("/admin/tests");
  revalidatePath(`/${skill}`);
  if (track === "pre_ielts") revalidatePath("/pre-ielts");
  else if (track === "intro") revalidatePath("/intro");
  else if (track === "discipline") revalidatePath("/discipline");
  return { ok: true };
}

export type SetRoleResult =
  | { ok: true; email: string; name: string | null; emailed: boolean; emailNote?: string }
  | { ok: false; error: string };

// Promote (role='admin') or revoke (role='student') a user by email. The
// privilege change is enforced in the DB by set_user_role (admin-only,
// SECURITY DEFINER). On promotion we best-effort email the person.
export async function setUserRole(
  email: string,
  role: "admin" | "student",
): Promise<SetRoleResult> {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const { supabase } = gate;

  const target = email.trim();
  if (!target) return { ok: false, error: "Enter an email address." };

  const { data, error } = await supabase.rpc("set_user_role", {
    target_email: target,
    new_role: role,
  });
  if (error) return { ok: false, error: error.message };

  const row = (Array.isArray(data) ? data[0] : data) as
    | { email: string; name: string | null }
    | undefined;
  const resolvedEmail = row?.email ?? target;
  const name = row?.name ?? null;

  let emailed = false;
  let emailNote: string | undefined;
  if (role === "admin") {
    const sent = await sendAdminPromotionEmail(resolvedEmail, name);
    emailed = sent.sent;
    if (!sent.sent) emailNote = sent.error;
  }

  revalidatePath("/admin");
  revalidatePath("/admin/team");
  return { ok: true, email: resolvedEmail, name, emailed, emailNote };
}

export type MemberRow = {
  id: string;
  email: string | null;
  name: string | null;
  role: string;
  level: string;
  premium_until: string | null;
  xp: number;
  hidden_from_leaderboard: boolean;
};

// Search accounts by email or name (admin-only). Empty query returns recent users.
export async function searchUsers(
  query: string,
): Promise<{ ok: true; users: MemberRow[] } | { ok: false; error: string }> {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const { supabase } = gate;

  // Strip characters with meaning in PostgREST filter syntax before interpolating.
  const q = query.trim().replace(/[,()*\\]/g, "");

  // `level` (0021) and `hidden_from_leaderboard` (0020) are long applied. This
  // used to try four progressively older column lists and retry on any error
  // whose text mentioned one of them, which meant a permissions failure looked
  // like a missing column and silently degraded the result.
  let req = supabase
    .from("profiles")
    .select("id, email, name, role, level, premium_until, xp, hidden_from_leaderboard")
    .order("created_at", { ascending: false })
    .limit(500);
  if (q) req = req.or(`email.ilike.%${q}%,name.ilike.%${q}%`);

  const { data, error } = await req;
  if (error) return { ok: false, error: error.message };
  return { ok: true, users: rows<MemberRow>(data) };
}

export type SetPremiumResult =
  | { ok: true; email: string; name: string | null; premium_until: string | null }
  | { ok: false; error: string };

// Grant/extend (months > 0) or revoke (months <= 0) premium for a user by email.
export async function setPremium(email: string, months: number): Promise<SetPremiumResult> {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const { supabase } = gate;

  const { data, error } = await supabase.rpc("set_premium", {
    target_email: email.trim(),
    months,
  });
  if (error) return { ok: false, error: error.message };

  const row = (Array.isArray(data) ? data[0] : data) as
    | { email: string; name: string | null; premium_until: string | null }
    | undefined;
  revalidatePath("/admin/members");
  revalidatePath("/admin");
  return {
    ok: true,
    email: row?.email ?? email,
    name: row?.name ?? null,
    premium_until: row?.premium_until ?? null,
  };
}

export type GiftXpResult =
  | { ok: true; email: string; name: string | null; xp: number }
  | { ok: false; error: string };

// Add (or with a negative amount, deduct) XP for a user by email.
export async function giftXp(email: string, amount: number): Promise<GiftXpResult> {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const { supabase } = gate;

  const { data, error } = await supabase.rpc("gift_xp", {
    target_email: email.trim(),
    amount,
  });
  if (error) return { ok: false, error: error.message };

  const row = (Array.isArray(data) ? data[0] : data) as
    | { email: string; name: string | null; xp: number }
    | undefined;
  revalidatePath("/admin/members");
  revalidatePath("/admin");
  return { ok: true, email: row?.email ?? email, name: row?.name ?? null, xp: row?.xp ?? 0 };
}

export type SetHiddenResult =
  | { ok: true; email: string; name: string | null; hidden: boolean }
  | { ok: false; error: string };

// Temporarily hide (or re-show) a user on the public leaderboard. Reversible;
// no data is deleted. Enforced admin-only in the DB by set_leaderboard_hidden.
export async function setLeaderboardHidden(
  email: string,
  hidden: boolean,
): Promise<SetHiddenResult> {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const { supabase } = gate;

  const { data, error } = await supabase.rpc("set_leaderboard_hidden", {
    target_email: email.trim(),
    hidden,
  });
  if (error) return { ok: false, error: error.message };

  const row = (Array.isArray(data) ? data[0] : data) as
    | { email: string; name: string | null; hidden_from_leaderboard: boolean }
    | undefined;
  revalidatePath("/admin/members");
  revalidatePath("/leaderboard");
  return {
    ok: true,
    email: row?.email ?? email,
    name: row?.name ?? null,
    hidden: row?.hidden_from_leaderboard ?? hidden,
  };
}

export async function deleteTest(id: string): Promise<ActionResult> {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const { supabase } = gate;

  // `file_path` is revoked from the authenticated role (migration 0034), so the
  // storage key is looked up with the service-role client. assertAdmin() above
  // is what authorises this.
  const { data: testRow } = await createAdminClient()
    .from("tests")
    .select("file_path, skill")
    .eq("id", id)
    .single();

  const test = testRow as { file_path?: string; skill?: string } | null;

  // Order matters, and so does checking the result.
  //
  // This used to remove the storage object first and DISCARD its error, then
  // delete the row. Both failure orders lose data: a failed removal orphans the
  // file, and a successful removal followed by a failed row delete leaves a
  // test that is still listed and still openable but whose only HTML file has
  // been destroyed — an uploaded paper exists nowhere else.
  //
  // Deleting the row first inverts that. The worst case becomes an orphaned
  // object in the bucket, which costs storage and nothing else, and the paper
  // is still recoverable until the second step succeeds.
  const { error } = await supabase.from("tests").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  if (test?.file_path) {
    const { error: rmErr } = await supabase.storage.from("tests").remove([test.file_path]);
    // The test is gone from the student's point of view, so this is not a
    // failed action — but the orphan needs to be visible to someone.
    if (rmErr) {
      console.error(`[deleteTest] row ${id} deleted, storage object left behind: ${rmErr.message}`);
    }
  }

  revalidatePath("/admin/tests");
  if (test?.skill) revalidatePath(`/${test.skill}`);
  return { ok: true };
}

/**
 * Renames a test IN PLACE, keeping its id.
 *
 * Why not delete-and-reupload: `results.test_id` is `on delete set null` and
 * `results` rows are `on delete cascade`, so a new row would silently strip
 * every student's attempt history for that test. The id
 * is the identity; the title is just a label.
 */
export async function renameTest(id: string, title: string): Promise<ActionResult> {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const { supabase } = gate;

  const next = title.trim().replace(/\s+/g, " ");
  if (!next) return { ok: false, error: "Title is required." };
  if (next.length > 120) return { ok: false, error: "Title is too long (max 120 characters)." };

  // `skill` is one of the columns migration 0034 still grants to `authenticated`,
  // so this needs no service-role client (unlike deleteTest, which reads the
  // revoked `file_path`).
  const { data: row } = await supabase
    .from("tests")
    .select("skill, title")
    .eq("id", id)
    .single();
  const test = row as { skill?: string; title?: string } | null;
  if (!test) return { ok: false, error: "Test not found." };
  if (test.title === next) return { ok: true };

  // Two tests of the same skill must never share a title. This is not cosmetic:
  // scripts/upload-listening.mjs and scripts/upload-premium-batch.mjs both run
  // `delete().eq("title", …)` before inserting, so a duplicate title means the
  // next re-upload quietly deletes the wrong row.
  const { data: clash } = await supabase
    .from("tests")
    .select("id")
    .eq("skill", test.skill ?? "")
    .eq("title", next)
    .neq("id", id)
    .limit(1);
  if (Array.isArray(clash) && clash.length > 0) {
    return { ok: false, error: `Another ${test.skill} test is already called "${next}".` };
  }

  // No .select() chained: a returning clause needs column SELECT privileges and
  // would fail under migration 0034.
  const { error } = await supabase.from("tests").update({ title: next }).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/tests");
  if (test.skill) {
    revalidatePath(`/${test.skill}`);
    revalidatePath(`/${test.skill}/${id}`);
  }
  return { ok: true };
}

// ----------------------------------------------------------- student levels
export type SetLevelResult =
  | { ok: true; email: string; level: string }
  | { ok: false; error: string };

// Move a student between learning tracks (regular / pre_ielts / intro).
// Enforced admin-only in the DB by set_user_level (SECURITY DEFINER).
export async function setUserLevel(email: string, level: string): Promise<SetLevelResult> {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const { supabase } = gate;

  const { data, error } = await supabase.rpc("set_user_level", {
    target_email: email.trim(),
    new_level: level,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/members");
  revalidatePath("/pre-ielts");
  revalidatePath("/intro");
  return { ok: true, email: email.trim(), level: (data as string) ?? level };
}
