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
// ON TOP of that shared gate, this route requires an ACCOUNT. resolveTestAccess
// lets an anonymous visitor OPEN a free test — that is the point of the public
// catalogue — but it must not let them read its key. It did, and the whole free
// library's answers were a cookieless GET away, enumerable straight from the
// public /reading listing.
//
// A guest never needed this: their score comes from /api/guest-grade, which
// deliberately returns only the band and withholds per-question correctness
// ("that is the paid review"), and the result screen sells the account on
// exactly the breakdown this route was handing over for free. The bridge's key
// fetch already handles a failure by leaving the report hidden, so a 401 here
// gives the guest precisely the experience that was designed for them.
//
// Accepted exposure, stated plainly: any SIGNED-IN user entitled to take a test
// can call this and read its answers without answering honestly. That is not a
// new hole — submitting a blank test reveals the same answers, in the
// standalone file too. What matters is that premium keys stay unreachable
// without a membership (the shared gate), and that free keys are not scriptable
// by an anonymous stranger (the check below).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const access = await resolveTestAccess(id);
  if (!access.ok) {
    return Response.json({ error: access.message }, { status: access.status });
  }
  if (!access.userId) {
    return Response.json({ error: "Sign in to see the answers" }, { status: 401 });
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
