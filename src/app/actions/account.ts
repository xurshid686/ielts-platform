"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fileStore } from "@/lib/storage";

// Self-service account deletion.
//
// Deleting the auth.users row is the whole job: every per-student table either
// cascades (profiles, results, writing/speaking submissions, notifications,
// premium passes, bot links …) or nulls its user column (mock_attempts,
// writing_practice_attempts, writing_ai_checks — kept anonymous so admin
// statistics stay correct). Checked against the live Frankfurt constraints on
// 2026-11-23: no foreign key blocks the delete.
//
// The only thing the database cannot cascade is files. Speaking recordings live
// in the `speaking` bucket under `<user id>/…`, so they are removed first,
// best-effort: a storage hiccup must not leave the student unable to leave.
//
// Admin and owner accounts are refused — losing the owner account by a
// mis-click would lock everyone out of the admin panel.

export type DeleteAccountResult = { ok: false; error: string };

export async function deleteMyAccount(confirmation: string): Promise<DeleteAccountResult> {
  if (confirmation.trim().toUpperCase() !== "DELETE") {
    return { ok: false, error: 'Type DELETE to confirm.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You are not signed in." };

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role, is_owner")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.is_owner || profile?.role === "admin") {
    return { ok: false, error: "Admin accounts can't be deleted from here." };
  }

  // Speaking recordings (the only per-student files).
  try {
    const { data: sessions } = await admin
      .from("speaking_submissions")
      .select("audio_paths")
      .eq("user_id", user.id);
    const paths = (sessions ?? [])
      .flatMap((s) => (Array.isArray(s.audio_paths) ? s.audio_paths : []))
      .filter((p): p is string => typeof p === "string");
    for (let i = 0; i < paths.length; i += 100) {
      await fileStore("speaking", admin).remove(paths.slice(i, i + 100));
    }
  } catch (err) {
    console.error("deleteMyAccount: speaking cleanup failed", err);
  }

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return { ok: false, error: `Could not delete the account: ${error.message}` };

  // The user no longer exists server-side; this just clears the cookies.
  await supabase.auth.signOut({ scope: "local" }).catch(() => {});
  redirect("/?account=deleted");
}
