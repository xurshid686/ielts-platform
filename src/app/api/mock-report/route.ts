import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAttemptDetail, UUID } from "@/lib/mock";
import { listAttemptsAdmin } from "@/lib/mock-admin";
import {
  imageMeta,
  renderReportDocx,
  renderReportPdf,
  reportData,
  reportFilename,
  type MockReportData,
  type ReportImage,
} from "@/lib/mock-report";

// The mock result as a file (owner, 2026-09-16): PDF or Word.
//
//   ?attempt=<id>&format=pdf|docx   one attempt — the student's own RELEASED
//                                   result, or any attempt for an admin
//   ?mock=<id>&format=pdf|docx      every attempt of a mock, admin only
//
// The report itself is built in lib/mock-report.ts; this route only decides who
// may read what, which is the same rule the pages use: a student sees their own
// result once it is released, and nothing before that.

const MAX_BULK = 200;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const format = url.searchParams.get("format") === "docx" ? "docx" : "pdf";
  const attemptId = url.searchParams.get("attempt");
  const mockId = url.searchParams.get("mock");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Sign in", { status: 401 });

  const admin = createAdminClient();
  const { data: prof } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const isAdmin = (prof as { role?: string } | null)?.role === "admin";

  // Task 1 pictures are in a private bucket; read them once per path.
  const images = new Map<string, ReportImage | null>();
  const image = async (path: string | null | undefined): Promise<ReportImage | null> => {
    if (!path) return null;
    if (images.has(path)) return images.get(path)!;
    let meta: ReportImage | null = null;
    try {
      const { data } = await admin.storage.from("mock-assets").download(path);
      if (data) meta = imageMeta(Buffer.from(await data.arrayBuffer()));
    } catch {
      meta = null;
    }
    images.set(path, meta);
    return meta;
  };

  const reports: MockReportData[] = [];
  let name: string[] = [];

  if (attemptId) {
    if (!UUID.test(attemptId)) return new Response("Not found", { status: 404 });
    const detail = await getAttemptDetail(attemptId);
    if (!detail) return new Response("Not found", { status: 404 });
    const a = detail.attempt;
    if (!isAdmin && (a.user_id !== user.id || a.status !== "released")) {
      return new Response("Not found", { status: 404 });
    }
    reports.push(reportData(detail, await image(a.writing_task1_image_path ?? detail.mock?.writing_task1_image_path)));
    name = [detail.mock?.title ?? "Mock", a.student_name?.trim() || a.student_email || "student"];
  } else if (mockId) {
    if (!isAdmin) return new Response("Not found", { status: 404 });
    if (!UUID.test(mockId)) return new Response("Not found", { status: 404 });
    const all = await listAttemptsAdmin();
    const mine = all.filter((a) => a.mock_id === mockId).slice(0, MAX_BULK);
    if (!mine.length) return new Response("No attempts on this mock yet.", { status: 404 });
    for (const row of mine) {
      const detail = await getAttemptDetail(row.id);
      if (!detail) continue;
      reports.push(
        reportData(detail, await image(detail.attempt.writing_task1_image_path ?? detail.mock?.writing_task1_image_path)),
      );
    }
    name = [reports[0]?.mockTitle ?? "Mock", `${reports.length} attempts`];
  } else {
    return new Response("Nothing to export.", { status: 400 });
  }

  const body = format === "docx" ? await renderReportDocx(reports) : await renderReportPdf(reports);
  return new Response(new Uint8Array(body), {
    status: 200,
    headers: {
      "Content-Type":
        format === "docx"
          ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          : "application/pdf",
      "Content-Disposition": `attachment; filename="${reportFilename(name, format)}"`,
      "Cache-Control": "no-store",
    },
  });
}
