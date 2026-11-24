import { attachmentDisposition } from "@/lib/content-disposition";
import { createClient } from "@/lib/supabase/server";
import { getMyReport } from "@/lib/writing-ai";
import { renderStudentReport } from "@/lib/writing-ai-email";

// A student's saved AI writing report as a PDF.
//
// The only rule that matters: it is the student's OWN finished practice check.
// getMyReport() scopes on the verified session's user id, so someone else's
// check id answers 404 (never 403: it must not confirm the id exists). Premium
// is NOT required — a report stays the student's after their membership ends.

export const maxDuration = 30;

export async function GET(_req: Request, { params }: { params: Promise<{ checkId: string }> }) {
  const { checkId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Sign in", { status: 401 });

  const mine = await getMyReport(user.id, checkId);
  if (!mine) return new Response("Not found", { status: 404 });

  const out = await renderStudentReport(mine.check.id);
  if (!out) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(out.pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": attachmentDisposition(out.filename),
      "Cache-Control": "private, no-store",
    },
  });
}
