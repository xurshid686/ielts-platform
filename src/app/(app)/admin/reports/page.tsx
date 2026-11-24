import { requireAdmin } from "@/lib/auth";
import { listReports, reportStatusCounts } from "@/lib/test-reports";
import { AdminReports } from "@/components/admin/admin-reports";
import type { ReportStatus } from "@/lib/test-reports-shared";

export const metadata = { title: "Problem reports" };

const STATUSES: ReportStatus[] = ["open", "fixed", "dismissed"];

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAdmin();
  const { status: raw } = await searchParams;
  const status = (STATUSES as string[]).includes(raw ?? "") ? (raw as ReportStatus) : "open";
  const [reports, counts] = await Promise.all([listReports(status), reportStatusCounts()]);
  return <AdminReports status={status} counts={counts} reports={reports} />;
}
