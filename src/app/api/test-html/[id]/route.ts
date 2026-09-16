import { injectScoringBridge } from "@/lib/ielts/scoring-bridge";
import { sanitizeTestHtml, stripTestHtml, SanitizeIncompleteError } from "@/lib/ielts/sanitize-test-html";
import { adaptForMock, adaptForReview, type MockServeContext } from "@/lib/ielts/mock-adapter";
import { findMockReview, findMockSitting, type MockReview } from "@/lib/mock";
import { publicOrigin } from "@/lib/public-origin";
import { asAnswerKey } from "@/lib/ielts/grade";
import { resolveTestAccess, downloadTestHtml } from "@/lib/tests/access";
import { getCachedTestHtml, setCachedTestHtml } from "@/lib/tests/html-cache";

// Serves a test's HTML with the correct Content-Type so the iframe RENDERS it
// (Supabase storage labels uploaded .html as text/plain, which browsers show as source).
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Entitlement is decided in one shared place, so this route and /api/test-key
  // (which hands back the answers after submission) can never disagree about
  // who may have a given test.
  const access = await resolveTestAccess(id);
  if (!access.ok) return new Response(access.message, { status: access.status });

  // A MOCK paper (0054) is served through the mock adapter, never the practice
  // bridge: storage namespaced to the sitting (the "Done" bug), the paper's own
  // start screen, timer and results switched off. A student needs the attempt
  // the runner put in the URL, and that attempt must be sitting this paper
  // with its clock running. An admin gets the adapter only for the upload
  // self-test (?selftest=<nonce>); otherwise the plain preview below.
  let mock: MockServeContext | null = null;
  // A RELEASED attempt may reopen its paper read-only (?review=<attemptId>,
  // 2026-09-16). That path runs on the practice pipeline further down — the
  // paper marks itself with the key /api/test-key hands back — so it is decided
  // here and kept out of `mock`, which means the exam adapter.
  let review: { ctx: MockServeContext; lines: MockReview["lines"]; summary: string } | null = null;
  if (access.row.track === "mock") {
    const url = new URL(req.url);
    const selftest = url.searchParams.get("selftest");
    const attemptParam = url.searchParams.get("mock");
    const reviewParam = url.searchParams.get("review");
    if (reviewParam && access.userId) {
      const found = await findMockReview(access.userId, id, reviewParam, access.isAdmin);
      if (!found) return new Response("Not found", { status: 404 });
      review = {
        ctx: {
          namespace: `review:${found.attemptId}:${found.section}:`,
          section: found.section,
          origin: publicOrigin(req),
          selftest: false,
          review: true,
        },
        lines: found.lines,
        summary: found.summary,
      };
    }
    const skill = access.row.skill === "listening" ? "listening" : "reading";
    if (review) {
      // decided above
    } else if (access.isAdmin && selftest) {
      if (!/^[a-z0-9]{6,40}$/i.test(selftest)) return new Response("Not found", { status: 404 });
      mock = { namespace: `selftest:${selftest}:`, section: skill, origin: publicOrigin(req), selftest: true };
    } else if (!access.isAdmin || attemptParam) {
      const sitting = access.userId && attemptParam ? await findMockSitting(access.userId, id, attemptParam) : null;
      if (!sitting) return new Response("Not found", { status: 404 });
      mock = {
        namespace: `mock:${sitting.attemptId}:${sitting.section}:`,
        section: sitting.section,
        origin: publicOrigin(req),
        selftest: false,
      };
    }
  }

  // The bucket is private and this is the only path that reads it, so a leaked
  // storage URL is useless and the gate above cannot be bypassed.
  //
  // The download is memoised per file_path (see html-cache.ts). The gate above
  // has already run, so a cache hit skips only the Storage round trip — never a
  // permission check. Sanitizing stays below, out of the cache, so the key is
  // never stored and the fail-closed check runs on every response.
  const filePath = access.row.file_path!;
  let raw = getCachedTestHtml(filePath);
  if (raw === null) {
    raw = await downloadTestHtml(filePath);
    if (raw === null) return new Response("Upstream error", { status: 502 });
    setCachedTestHtml(filePath, raw);
  }

  // A test with a stored key is graded server-side, so the key / explanations /
  // evidence are stripped before the file reaches the browser. The injected
  // bridge fetches them back from /api/test-key the moment the student submits,
  // which is what makes the test's own results screen work as it does in the
  // standalone file.
  //
  // A test WITHOUT a stored key has to keep scoring itself — blanking its key
  // would leave it ungradable. Those are a migration gap, not a design: run
  // `node scripts/backfill-keys.mjs` so every test lands on the sanitized path.
  //
  // Sanitizing FAILS CLOSED: if the strip left a key behind, nothing is served.
  // The alternative is shipping the answers while every check still reports the
  // file as clean — the audit script only inspects the database column, never
  // the bytes that actually go out.
  const hasKey = !!asAnswerKey(access.row.answer_key);
  let html: string;
  try {
    if (review) {
      // The key is STRIPPED here too: the marking is injected per question from
      // the attempt's own snapshot, so the file never carries the answers.
      html = adaptForReview(stripTestHtml(raw, publicOrigin(req), id), review.ctx, review.lines, review.summary);
    } else if (mock) {
      // No key, no mock: grading is server-side and a keyless paper never passes readiness.
      if (!hasKey) return new Response("This paper has no answer key.", { status: 502 });
      html = adaptForMock(stripTestHtml(raw, publicOrigin(req), id), mock);
    } else {
      html = hasKey ? sanitizeTestHtml(raw, publicOrigin(req), id) : injectScoringBridge(raw);
    }
  } catch (e) {
    if (e instanceof SanitizeIncompleteError) {
      console.error(`[test-html] refusing to serve ${id}: ${e.message}`);
      return new Response("This test is temporarily unavailable.", { status: 502 });
    }
    throw e;
  }

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // no-store so the latest scoring bridge is always served (never a stale copy)
      "Cache-Control": "no-store, must-revalidate",
    },
  });
}
