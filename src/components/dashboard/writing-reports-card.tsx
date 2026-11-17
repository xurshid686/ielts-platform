import Link from "next/link";
import { ArrowRight, ClipboardCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { MiniRadar } from "@/components/writing/report-charts";
import { headlineBand, type AiTaskResult } from "@/lib/writing-ai-shared";

export type DashboardReport = { id: string; at: string; results: AiTaskResult[] };

/**
 * The student's saved AI writing reports: latest band, change since the one
 * before, and a way in. Reports are theirs for good, so this shows for lapsed
 * Premium students too. Renders nothing until the first report exists.
 * `reports` is newest first.
 */
export function WritingReportsCard({ reports }: { reports: DashboardReport[] }) {
  if (!reports.length) return null;
  const [latest, previous] = reports;
  const band = headlineBand(latest.results);
  const before = previous ? headlineBand(previous.results) : null;
  const delta = band != null && before != null ? +(band - before).toFixed(1) : null;

  return (
    <Card className="flex flex-wrap items-center gap-x-5 gap-y-3" data-dashboard-reports>
      <MiniRadar results={latest.results} />
      <div className="min-w-[10rem] flex-1">
        <h3 className="flex items-center gap-1.5 text-sm font-medium text-muted">
          <ClipboardCheck className="h-4 w-4" aria-hidden /> Writing reports
        </h3>
        <p className="mt-0.5 text-sm">
          Latest AI estimate{" "}
          <strong className="text-lg tabular-nums">{band == null ? "—" : band.toFixed(1)}</strong>
          {delta != null && delta !== 0 && (
            <span className={`ml-2 text-sm font-semibold tabular-nums ${delta > 0 ? "text-success" : "text-danger"}`}>
              {delta > 0 ? `+${delta}` : delta} since the one before
            </span>
          )}
        </p>
        <p className="text-xs text-muted">
          {reports.length >= 20 ? "20+" : reports.length} saved {reports.length === 1 ? "report" : "reports"} · checked{" "}
          {new Date(latest.at).toLocaleDateString()}
        </p>
      </div>
      <Link
        href={`/writing/reports/${latest.id}`}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface-2"
      >
        Open latest <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
      <Link href="/writing/reports" className="text-sm font-medium text-primary hover:underline">
        All reports
      </Link>
    </Card>
  );
}
