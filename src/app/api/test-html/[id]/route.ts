import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { injectScoringBridge } from "@/lib/ielts/scoring-bridge";
import { sanitizeTestHtml } from "@/lib/ielts/sanitize-test-html";
import { asAnswerKey } from "@/lib/ielts/grade";
import { canAccessTest } from "@/lib/premium";
import { canAccessTrack } from "@/lib/levels";

// Serves a test's HTML with the correct Content-Type so the iframe RENDERS it
// (Supabase storage labels uploaded .html as text/plain, which browsers show as source).
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  // The test row is read with the SERVICE-ROLE client: `answer_key` is not
  // readable by ordinary users any more (see the tests_public view), and this
  // route needs it to decide whether the file can be served sanitized.
  const admin = createAdminClient();
  let testRes = await admin
    .from("tests")
    .select("file_path, tier, track, answer_key")
    .eq("id", id)
    .single();
  if (testRes.error && /track/.test(testRes.error.message)) {
    testRes = await admin
      .from("tests")
      .select("file_path, tier, answer_key")
      .eq("id", id)
      .single();
  }
  const row = testRes.data as {
    file_path?: string;
    tier?: string;
    track?: string;
    answer_key?: unknown;
  } | null;
  const filePath = row?.file_path;
  if (!filePath) return new Response("Not found", { status: 404 });

  // Load the viewer's profile once (role/premium drive premium; level drives track).
  let profRes = await supabase
    .from("profiles")
    .select("role, premium_until, level")
    .eq("id", user.id)
    .single();
  if (profRes.error && /level/.test(profRes.error.message)) {
    profRes = await supabase
      .from("profiles")
      .select("role, premium_until")
      .eq("id", user.id)
      .single();
  }
  const profile = (profRes.data as {
    role?: string;
    premium_until?: string | null;
    level?: string | null;
  } | null) ?? { role: "student", premium_until: null, level: "regular" };

  // Level gate: a Pre-IELTS / Intro test is only served to students of that
  // level (admins pass). Treat as not-found for everyone else.
  if (!canAccessTrack({ role: profile.role ?? "student", level: profile.level }, row?.track)) {
    return new Response("Not found", { status: 404 });
  }

  // Premium gate: premium content is served only to subscribers, admins, or
  // users who unlocked this specific test with XP.
  if (row?.tier === "premium") {
    const { data: unlock } = await supabase
      .from("unlocks")
      .select("id")
      .eq("user_id", user.id)
      .eq("test_id", id)
      .limit(1);
    const unlocked = Array.isArray(unlock) && unlock.length > 0;
    if (
      !canAccessTest(
        { role: profile.role ?? "student", premium_until: profile.premium_until ?? null },
        { tier: "premium" },
        unlocked,
      )
    ) {
      return new Response("Premium membership required", { status: 403 });
    }
  }

  // Download the file with the service-role client. This is the ONLY path that
  // reads test HTML, so the storage bucket can stay private — a leaked public
  // URL is useless, and the premium/track gates above can't be bypassed.
  const { data: blob, error: dlErr } = await admin.storage.from("tests").download(filePath);
  if (dlErr || !blob) return new Response("Upstream error", { status: 502 });

  const raw = await blob.text();

  // A test with a stored key is graded server-side, so the key / explanations /
  // evidence are stripped before the file ever reaches the browser and the page
  // only reports the student's answers back.
  //
  // A test WITHOUT a stored key has to keep scoring itself — blanking its key
  // would leave it ungradable. Those are a migration gap, not a design: run
  // `node scripts/backfill-keys.mjs` so every test lands on the sanitized path.
  const hasKey = !!asAnswerKey(row?.answer_key);
  const html = hasKey
    ? sanitizeTestHtml(raw, new URL(req.url).origin)
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
