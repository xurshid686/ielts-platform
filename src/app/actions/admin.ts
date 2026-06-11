"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { extractAnswerKey } from "@/lib/ielts/extract-key";
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
  const { supabase, user } = gate;

  const title = String(formData.get("title") || "").trim();
  const skill = String(formData.get("skill") || "");
  const kind = String(formData.get("kind") || "single") === "full" ? "full" : "single";
  const tier = String(formData.get("tier") || "free") === "premium" ? "premium" : "free";
  const questionTypes = formData
    .getAll("question_types")
    .map((v) => String(v))
    .filter(Boolean);
  const level = String(formData.get("level") || "").trim() || null;
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

  // Extract the answer key now so the platform can grade this test server-side.
  // (Null is fine — the test still works via the client-score fallback.)
  const extracted = extractAnswerKey(await file.text());

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
    kind,
    tier,
    question_types: questionTypes,
    level,
    passage,
    file_url: publicUrl,
    file_path: path,
    answer_key: extracted?.key ?? null,
    total: extracted?.total ?? null,
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

  // Select including hidden_from_leaderboard (0020); fall back without it if the
  // migration hasn't been applied yet, so the admin page keeps working.
  for (const cols of [
    "id, email, name, role, premium_until, xp, hidden_from_leaderboard",
    "id, email, name, role, premium_until, xp",
  ]) {
    let req = supabase
      .from("profiles")
      .select(cols)
      .order("created_at", { ascending: false })
      .limit(20);
    if (q) req = req.or(`email.ilike.%${q}%,name.ilike.%${q}%`);

    const { data, error } = await req;
    if (!error) {
      const rows = (data ?? []) as unknown as Record<string, unknown>[];
      const users = rows.map((u) => ({
        hidden_from_leaderboard: false,
        ...u,
      })) as unknown as MemberRow[];
      return { ok: true, users };
    }
    // Only retry on a missing-column error; otherwise surface it.
    if (!/hidden_from_leaderboard/.test(error.message)) {
      return { ok: false, error: error.message };
    }
  }
  return { ok: false, error: "Could not load accounts." };
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
