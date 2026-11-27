import { Upload } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { UploadForm } from "@/components/admin/upload-form";
import { loadProgramme } from "@/lib/discipline";
import { loadTestStats } from "@/lib/admin/stats";
import { PageHeader, Panel } from "@/components/admin/ui/primitives";
import { TestsTable, type TestTableRow } from "@/components/admin/tests-table";

type Row = Omit<TestTableRow, "attempts" | "students" | "avg_band" | "avg_accuracy" | "open_reports">;

export default async function AdminTestsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const supabase = await createClient();

  const [list, stats, disciplineDays] = await Promise.all([
    // Explicit columns: `answer_key` is revoked from the authenticated role
    // (migration 0034), so `select("*")` would fail even for an admin. Paged:
    // the library is past 500 rows and PostgREST stops at 1000.
    fetchAll<Row>("tests", (from, to) =>
      supabase
        .from("tests")
        .select("id, title, skill, kind, tier, track, passage, total, question_types, created_at")
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to),
    ),
    loadTestStats(),
    // Drafts included: a paper should be loadable onto next week's day before
    // that day goes live. The picker labels them "(draft)".
    loadProgramme(true),
  ]);

  const tests: TestTableRow[] = list.map((t) => {
    const s = stats.get(t.id);
    return {
      ...t,
      attempts: s?.attempts ?? 0,
      students: s?.students ?? 0,
      avg_band: s?.avg_band ?? null,
      avg_accuracy: s?.avg_accuracy ?? null,
      open_reports: s?.open_reports ?? 0,
    };
  });

  const premium = tests.filter((t) => t.tier === "premium").length;
  const openUpload = sp.upload === "1";

  return (
    <div className="space-y-4">
      <PageHeader
        title="Tests"
        description={`${tests.length} tests · ${premium} premium · ${tests.length - premium} free. Change tier, track, passage and question types right in the table.`}
      />

      <details open={openUpload} className="group rounded-xl border border-border bg-surface shadow-soft">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-[13px] font-semibold">
          <Upload className="h-4 w-4 text-primary" /> Upload a test
          <span className="ml-auto text-xs font-normal text-muted group-open:hidden">Open</span>
          <span className="ml-auto hidden text-xs font-normal text-muted group-open:inline">Close</span>
        </summary>
        <div className="border-t border-border p-4">
          <UploadForm
            disciplineDays={disciplineDays.map((d) => ({
              id: d.id,
              day_number: d.day_number,
              title: d.title,
              published: d.published,
            }))}
          />
        </div>
      </details>

      <Panel bodyClassName="p-3">
        <TestsTable tests={tests} />
      </Panel>
    </div>
  );
}
