import Link from "next/link";
import { BarChart3, ArrowRight, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import type { WeeklyReport } from "@/types/database";

export const metadata = { title: "Weekly reports" };

function fmtRange(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${s.toLocaleDateString(undefined, opts)} – ${e.toLocaleDateString(undefined, {
    ...opts,
    year: "numeric",
  })}`;
}

export default async function ReportsPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data } = await supabase
    .from("weekly_reports")
    .select("*")
    .eq("user_id", profile.id)
    .order("period_start", { ascending: false });

  const reports = (data ?? []) as WeeklyReport[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Weekly reports 📊</h1>
        <p className="text-muted">
          A progress digest lands here every Sunday — tests done, scores, and rating change.
        </p>
      </div>

      {reports.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <BarChart3 className="h-6 w-6" />
          </div>
          <p className="font-medium">No reports yet</p>
          <p className="max-w-sm text-sm text-muted">
            Complete some tests this week and your first report will arrive on Sunday.
          </p>
          <Link
            href="/reading"
            className="mt-1 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            Start practising <ArrowRight className="h-4 w-4" />
          </Link>
        </Card>
      ) : (
        <ul className="space-y-3">
          {reports.map((r) => (
            <li key={r.id}>
              <Link href={`/reports/${r.id}`}>
                <Card interactive className="flex items-center gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <BarChart3 className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{fmtRange(r.period_start, r.period_end)}</p>
                    <p className="text-sm text-muted">
                      {r.tests_completed} test{r.tests_completed === 1 ? "" : "s"}
                      {r.avg_band != null && <> · avg band {r.avg_band}</>}
                      {r.best_band != null && <> · best {r.best_band}</>}
                    </p>
                  </div>
                  <Delta delta={r.rating_delta} />
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted" />
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Delta({ delta }: { delta: number }) {
  const cls = delta > 0 ? "text-success" : delta < 0 ? "text-danger" : "text-muted";
  const Icon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 text-sm font-semibold tabular-nums ${cls}`}>
      <Icon className="h-4 w-4" />
      {delta > 0 ? `+${delta}` : delta}
    </span>
  );
}
