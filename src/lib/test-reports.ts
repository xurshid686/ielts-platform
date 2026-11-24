import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  REPORT_SAME_TEST_MINUTES,
  type CleanReport,
  type ReportStatus,
} from "@/lib/test-reports-shared";

/**
 * "Report a problem" (0072). Service role, authorisation-free: every caller
 * gates first (the student action on a verified session, the admin actions on
 * assertAdmin). test_reports has no grants for anon/authenticated.
 *
 * The table is newer than the generated types, so it goes through an untyped
 * client (the lib/passes.ts stopgap) until `npm run types` is re-run.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any;

export type TestReportRow = {
  id: string;
  test_id: string;
  user_id: string | null;
  category: string;
  question: string | null;
  message: string;
  page_url: string | null;
  user_agent: string | null;
  status: ReportStatus;
  resolved_at: string | null;
  rewarded: boolean;
  created_at: string;
  test: { title: string; skill: string } | null;
  student: { name: string | null; email: string | null } | null;
};

/** Reports this student sent since Tashkent midnight, and on this test in the last few minutes. */
export async function reportCounts(userId: string, testId: string): Promise<{ today: number; recentSameTest: number }> {
  // Tashkent is UTC+5 with no DST; "today" is a Tashkent day like the weekly passes.
  const OFFSET = 5 * 3600_000;
  const local = Date.now() + OFFSET;
  const tashkentMidnight = new Date(local - (local % 86_400_000) - OFFSET);
  const since = new Date(Date.now() - REPORT_SAME_TEST_MINUTES * 60_000).toISOString();
  const [a, b] = await Promise.all([
    db().from("test_reports").select("id", { count: "exact", head: true })
      .eq("user_id", userId).gte("created_at", tashkentMidnight.toISOString()),
    db().from("test_reports").select("id", { count: "exact", head: true })
      .eq("user_id", userId).eq("test_id", testId).gte("created_at", since),
  ]);
  return { today: a.count ?? 0, recentSameTest: b.count ?? 0 };
}

export async function insertReport(input: CleanReport & {
  testId: string;
  userId: string;
  pageUrl: string | null;
  userAgent: string | null;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { data, error } = await db()
    .from("test_reports")
    .insert({
      test_id: input.testId,
      user_id: input.userId,
      category: input.category,
      question: input.question,
      message: input.message,
      page_url: input.pageUrl?.slice(0, 500) ?? null,
      user_agent: input.userAgent?.slice(0, 400) ?? null,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "insert failed" };
  return { ok: true, id: data.id as string };
}

export async function getReport(id: string): Promise<TestReportRow | null> {
  const { data } = await db()
    .from("test_reports")
    .select("*, test:tests(title, skill), student:profiles!test_reports_user_id_fkey(name, email)")
    .eq("id", id)
    .maybeSingle();
  return (data as TestReportRow | null) ?? null;
}

export async function listReports(status: ReportStatus): Promise<TestReportRow[]> {
  const { data, error } = await db()
    .from("test_reports")
    .select("*, test:tests(title, skill), student:profiles!test_reports_user_id_fkey(name, email)")
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw new Error(error.message);
  return (data ?? []) as TestReportRow[];
}

export async function reportStatusCounts(): Promise<Record<ReportStatus, number>> {
  const out: Record<ReportStatus, number> = { open: 0, fixed: 0, dismissed: 0 };
  await Promise.all(
    (Object.keys(out) as ReportStatus[]).map(async (s) => {
      const { count } = await db().from("test_reports").select("id", { count: "exact", head: true }).eq("status", s);
      out[s] = count ?? 0;
    }),
  );
  return out;
}

/**
 * Close an OPEN report. Conditional on status='open', so of two clicks only one
 * returns the row; the caller rewards only when it got the row back.
 */
export async function closeReport(
  id: string,
  status: "fixed" | "dismissed",
  adminId: string,
): Promise<TestReportRow | null> {
  const { data } = await db()
    .from("test_reports")
    .update({ status, resolved_at: new Date().toISOString(), resolved_by: adminId })
    .eq("id", id)
    .eq("status", "open")
    .select("id")
    .maybeSingle();
  if (!data) return null;
  return getReport(id);
}

/** Mark the reward as paid; conditional so it can only flip once. */
export async function markRewarded(id: string): Promise<boolean> {
  const { data } = await db()
    .from("test_reports")
    .update({ rewarded: true })
    .eq("id", id)
    .eq("rewarded", false)
    .select("id")
    .maybeSingle();
  return !!data;
}

/** Reopen a closed report (owner clicked by mistake). Never takes XP back. */
export async function reopenReport(id: string): Promise<boolean> {
  const { data } = await db()
    .from("test_reports")
    .update({ status: "open", resolved_at: null, resolved_by: null })
    .eq("id", id)
    .neq("status", "open")
    .select("id")
    .maybeSingle();
  return !!data;
}

export async function thankReporter(userId: string, testTitle: string, href: string): Promise<void> {
  const { error } = await db().from("notifications").insert({
    user_id: userId,
    type: "report_fixed",
    title: "Thanks, we fixed it",
    body: `The problem you reported in "${testTitle}" is fixed. +50 XP for helping other students.`,
    data: { href },
  });
  if (error) console.error("[test-reports] thank-you notification failed", error.message);
}

/** Undo markRewarded when the XP grant itself failed, so a retry can pay. */
export async function unmarkRewarded(id: string): Promise<void> {
  await db().from("test_reports").update({ rewarded: false }).eq("id", id);
}
