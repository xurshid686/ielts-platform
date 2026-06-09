"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Mark a single notification read (RLS limits this to the caller's own rows).
export async function markNotificationRead(id: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .is("read_at", null);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function markAllNotificationsRead(): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);
  revalidatePath("/", "layout");
  return { ok: true };
}

export type SendReportResult =
  | { ok: true; tests: number; avgBand: number | null; bestBand: number | null }
  | { ok: false; error: string };

// Admin-only: send a weekly report to a user on demand (any day). The DB
// function is admin-gated, so this is safe even if called directly.
export async function adminSendWeeklyReport(
  userId: string,
  periodStart?: string,
): Promise<SendReportResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: reportId, error } = await supabase.rpc("admin_send_weekly_report", {
    p_user: userId,
    p_period_start: periodStart ?? null,
  });
  if (error) return { ok: false, error: error.message };

  // Read back the freshly written report for a confirmation summary.
  const { data: report } = await supabase
    .from("weekly_reports")
    .select("tests_completed, avg_band, best_band")
    .eq("id", reportId as string)
    .maybeSingle();

  revalidatePath("/admin/members");
  const r = report as
    | { tests_completed: number; avg_band: number | null; best_band: number | null }
    | null;
  return {
    ok: true,
    tests: r?.tests_completed ?? 0,
    avgBand: r?.avg_band ?? null,
    bestBand: r?.best_band ?? null,
  };
}
