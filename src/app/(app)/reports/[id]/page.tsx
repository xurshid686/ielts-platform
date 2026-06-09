import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { WeeklyReportView } from "@/components/reports/weekly-report-view";
import type { WeeklyReport } from "@/types/database";

export const metadata = { title: "Weekly report" };

export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireProfile();
  const supabase = await createClient();

  // RLS limits this to the owner (or an admin).
  const { data } = await supabase.from("weekly_reports").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/reports"
        className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> All reports
      </Link>
      <WeeklyReportView report={data as WeeklyReport} />
    </div>
  );
}
