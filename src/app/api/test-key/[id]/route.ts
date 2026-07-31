import { resolveTestAccess, downloadTestHtml } from "@/lib/tests/access";
import { extractSensitiveLiterals } from "@/lib/ielts/sanitize-test-html";

// Hands back a test's answer key, explanations and evidence — the data that
// /api/test-html strips out before serving the file.
//
// Why this exists: the CDI test's whole post-submit experience (the score
// report, the per-question marking, the explanations, highlighting the proving
// sentence in the passage) is built on those objects. Blanking them to keep the
// answers out of the browser BEFORE submission also killed the results screen.
// This route gives them back the moment a student submits, so the file behaves
// exactly as it does standalone.
//
// The entitlement check is the same one /api/test-html uses (resolveTestAccess),
// deliberately shared so the two can never drift: this must never return a key
// for a test the caller could not have opened.
//
// Accepted exposure, stated plainly: anyone entitled to TAKE a test can call
// this and read its answers without answering honestly. That is not a new hole
// — submitting a blank test reveals the same answers, in the standalone file
// too. What matters is that premium keys stay unreachable to anyone without a
// membership, which the shared gate enforces.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const access = await resolveTestAccess(id);
  if (!access.ok) {
    return Response.json({ error: access.message }, { status: access.status });
  }

  const html = await downloadTestHtml(access.row.file_path!);
  if (html === null) {
    return Response.json({ error: "Upstream error" }, { status: 502 });
  }

  const literals = extractSensitiveLiterals(html);
  if (Object.keys(literals).length === 0) {
    return Response.json({ error: "This test has no stored answers" }, { status: 409 });
  }

  return Response.json(
    { literals },
    { headers: { "Cache-Control": "no-store, must-revalidate" } },
  );
}
