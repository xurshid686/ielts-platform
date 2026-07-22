import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizePublicTestHtml } from "@/lib/ielts/sanitize-public";

// Serves a shareable test's sanitized HTML. Requires a signed-in user — test
// taking is login-only. Only tests explicitly flagged `is_public = true` are
// served here, and the HTML is stripped of its answer key / explanations /
// evidence / download tools first (see sanitizePublicTestHtml). Grading
// happens server-side via /api/public-grade.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  // Service-role read: the `tests` bucket + table stay private; we gate on
  // is_public ourselves so non-public/premium content can never leak here.
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("tests")
    .select("file_path, is_public")
    .eq("id", id)
    .single();

  const test = row as { file_path?: string; is_public?: boolean } | null;
  if (!test || test.is_public !== true || !test.file_path) {
    return new Response("Not found", { status: 404 });
  }

  const { data: blob, error: dlErr } = await admin.storage.from("tests").download(test.file_path);
  if (dlErr || !blob) return new Response("Upstream error", { status: 502 });

  const html = sanitizePublicTestHtml(await blob.text());
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, must-revalidate",
    },
  });
}
