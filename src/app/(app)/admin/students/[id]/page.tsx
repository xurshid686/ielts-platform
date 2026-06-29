import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import type { Result, Test } from "@/types/database";

export const metadata = { title: "Student attempts" };

// Admin-only: every test attempt by one student, each linking to its full
// per-question report. RLS (results_select_owner_or_admin) lets an admin read
// any user's results, so no extra service-role access is needed.
export default async function StudentAttemptsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const supabase = await createClient();

  const { data: profRow } = await supabase
    .from("profiles")
    .select("name, email")
    .eq("id", id)
    .single();
  if (!profRow) notFound();
  const profile = profRow as { name: string | null; email: string | null };

  const { data: resRows } = await supabase
    .from("results")
    .select("id, skill, raw, total, band, test_id, submitted_at")
    .eq("user_id", id)
    .order("submitted_at", { ascending: false })
    .limit(500);
  const results = (resRows ?? []) as Pick<
    Result,
    "id" | "skill" | "raw" | "total" | "band" | "test_id" | "submitted_at"
  >[];

  // Resolve test titles in one query.
  const testIds = [...new Set(results.map((r) => r.test_id).filter(Boolean))] as string[];
  const titles = new Map<string, string>();
  if (testIds.length) {
    const { data: tRows } = await supabase.from("tests").select("id, title").in("id", testIds);
    for (const t of (tRows ?? []) as Pick<Test, "id" | "title">[]) titles.set(t.id, t.title);
  }

  const who = profile.name || profile.email || "Student";

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/admin/my-students"
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> My students
        </Link>
        <h1 className="text-2xl font-bold">{who}’s attempts</h1>
        <p className="text-muted">
          {profile.email}
          {results.length ? ` · ${results.length} attempt${results.length === 1 ? "" : "s"}` : ""}
        </p>
      </div>

      {results.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">
          This student hasn’t completed any tests yet.
        </div>
      ) : (
        <Card className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-5 py-3 font-medium">Test</th>
                  <th className="px-5 py-3 font-medium">Skill</th>
                  <th className="px-5 py-3 text-right font-medium">Score</th>
                  <th className="px-5 py-3 text-right font-medium">Band</th>
                  <th className="px-5 py-3 font-medium">When</th>
                  <th className="px-5 py-3 text-right font-medium">Report</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {results.map((r) => {
                  const title = r.test_id ? titles.get(r.test_id) ?? "Untitled test" : "Manual entry";
                  const score = r.raw != null && r.total != null ? `${r.raw}/${r.total}` : "—";
                  const date = new Date(r.submitted_at).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                  return (
                    <tr key={r.id} className="hover:bg-surface-2/50">
                      <td className="px-5 py-3 font-medium">{title}</td>
                      <td className="px-5 py-3 capitalize text-muted">{r.skill}</td>
                      <td className="px-5 py-3 text-right font-semibold tabular-nums">{score}</td>
                      <td className="px-5 py-3 text-right tabular-nums">
                        {r.band != null ? Number(r.band).toFixed(1) : "—"}
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap text-muted">{date}</td>
                      <td className="px-5 py-3 text-right">
                        <Link
                          href={`/review/${r.id}`}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 font-medium text-primary hover:bg-surface-2"
                        >
                          <FileText className="h-3.5 w-3.5" /> Full report
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
