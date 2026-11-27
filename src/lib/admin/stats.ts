import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { workloadCounts } from "@/lib/mock-admin";
import { ageLabel, asDashboardStats, type DashboardStats, type Range } from "@/lib/admin/stats-shared";

// Loaders for the admin panel v2.
//
// The three 0076 RPCs check is_admin(auth.uid()), so they are called with the
// admin's SESSION client — the service role has no auth.uid() and would be
// refused (the record_activity trap, CLAUDE.md). Pages gate with
// requireAdmin() first; the RPC's own check is the real boundary.
//
// The RPCs are not in src/types/supabase.ts until `npm run types` is run with a
// personal access token, so they go through an untyped client (the
// lib/passes.ts stopgap) and are narrowed at runtime. Drop the cast once the
// types are regenerated.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpcClient = async () => (await createClient()) as any;

export async function loadDashboardStats(days: Range): Promise<DashboardStats> {
  const { data, error } = await (await rpcClient()).rpc("admin_dashboard_stats", { p_days: days });
  if (error) throw new Error(`[admin] dashboard stats failed: ${error.message}`);
  return asDashboardStats(data);
}

export type ActivityItem = {
  kind: "signup" | "result" | "payment" | "mock" | "report";
  at: string;
  user_id: string | null;
  name: string | null;
  label: string | null;
  detail: string | null;
  ref_id: string | null;
};

export async function loadRecentActivity(limit = 40): Promise<ActivityItem[]> {
  const { data, error } = await (await rpcClient()).rpc("admin_recent_activity", { p_limit: limit });
  if (error) throw new Error(`[admin] activity feed failed: ${error.message}`);
  return ((data ?? []) as ActivityItem[]).filter((r) => r && typeof r.at === "string");
}

export type TestStat = {
  test_id: string;
  attempts: number;
  students: number;
  avg_band: number | null;
  avg_accuracy: number | null;
  open_reports: number;
};

export async function loadTestStats(): Promise<Map<string, TestStat>> {
  const { data, error } = await (await rpcClient()).rpc("admin_test_stats");
  if (error) throw new Error(`[admin] test stats failed: ${error.message}`);
  const num = (v: unknown) => (v == null ? null : Number(v));
  const out = new Map<string, TestStat>();
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    out.set(String(r.test_id), {
      test_id: String(r.test_id),
      attempts: Number(r.attempts) || 0,
      students: Number(r.students) || 0,
      avg_band: num(r.avg_band),
      avg_accuracy: num(r.avg_accuracy),
      open_reports: Number(r.open_reports) || 0,
    });
  }
  return out;
}

export type BadgeCounts = {
  requests: number;
  grading: number;
  release: number;
  reports: number;
  converter: number;
};

/** Waiting-work counts for the sidebar. Head counts only, service role. A
 *  failing count shows no badge rather than breaking every admin page. */
export async function adminBadgeCounts(isOwner: boolean): Promise<BadgeCounts> {
  const db = createAdminClient();
  const head = async (p: PromiseLike<{ count: number | null; error: unknown }>) => {
    try {
      const { count, error } = await p;
      return error ? 0 : (count ?? 0);
    } catch {
      return 0;
    }
  };
  const [work, reports, converter] = await Promise.all([
    workloadCounts().catch(() => ({ pending: 0, needsGrading: 0, readyToRelease: 0 })),
    head(
      // test_reports (0072) is newer than the generated types.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db as any).from("test_reports").select("id", { count: "exact", head: true }).eq("status", "open"),
    ),
    isOwner
      ? head(
          db
            .from("conversion_jobs")
            .select("id", { count: "exact", head: true })
            .eq("status", "passed"),
        )
      : Promise.resolve(0),
  ]);
  return {
    requests: work.pending,
    grading: work.needsGrading,
    release: work.readyToRelease,
    reports,
    converter,
  };
}

/** Backlog ages for the overview, computed here because Date.now() inside a
 *  server component trips the react purity lint. */
export function backlogAges(s: DashboardStats): { grading: string | null; reports: string | null } {
  const now = Date.now();
  return {
    grading: ageLabel(s.totals.oldest_ungraded_at, now),
    reports: ageLabel(s.totals.oldest_open_report_at, now),
  };
}
