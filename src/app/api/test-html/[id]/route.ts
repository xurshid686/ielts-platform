import { injectScoringBridge } from "@/lib/ielts/scoring-bridge";
import { sanitizeTestHtml } from "@/lib/ielts/sanitize-test-html";
import { asAnswerKey } from "@/lib/ielts/grade";
import { resolveTestAccess, downloadTestHtml } from "@/lib/tests/access";

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

  // The bucket is private and this is the only path that reads it, so a leaked
  // storage URL is useless and the gate above cannot be bypassed.
  const raw = await downloadTestHtml(access.row.file_path!);
  if (raw === null) return new Response("Upstream error", { status: 502 });

  // A test with a stored key is graded server-side, so the key / explanations /
  // evidence are stripped before the file reaches the browser. The injected
  // bridge fetches them back from /api/test-key the moment the student submits,
  // which is what makes the test's own results screen work as it does in the
  // standalone file.
  //
  // A test WITHOUT a stored key has to keep scoring itself — blanking its key
  // would leave it ungradable. Those are a migration gap, not a design: run
  // `node scripts/backfill-keys.mjs` so every test lands on the sanitized path.
  const hasKey = !!asAnswerKey(access.row.answer_key);
  const html = hasKey
    ? sanitizeTestHtml(raw, new URL(req.url).origin, id)
    : injectScoringBridge(raw);

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // no-store so the latest scoring bridge is always served (never a stale copy)
      "Cache-Control": "no-store, must-revalidate",
    },
  });
}
