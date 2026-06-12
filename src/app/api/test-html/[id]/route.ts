import { createClient } from "@/lib/supabase/server";
import { injectScoringBridge } from "@/lib/ielts/scoring-bridge";
import { canAccessTest } from "@/lib/premium";
import { canAccessTrack } from "@/lib/levels";

// Serves a test's HTML with the correct Content-Type so the iframe RENDERS it
// (Supabase storage labels uploaded .html as text/plain, which browsers show as source).
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

  // Fetch the test (incl. its track) with a graceful fallback if the 0021
  // migration (tests.track) hasn't been run yet.
  let testRes = await supabase.from("tests").select("file_url, tier, track").eq("id", id).single();
  if (testRes.error && /track/.test(testRes.error.message)) {
    testRes = await supabase.from("tests").select("file_url, tier").eq("id", id).single();
  }
  const row = testRes.data as { file_url?: string; tier?: string; track?: string } | null;
  const fileUrl = row?.file_url;
  if (!fileUrl) return new Response("Not found", { status: 404 });

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

  const upstream = await fetch(fileUrl, { cache: "no-store" });
  if (!upstream.ok) return new Response("Upstream error", { status: 502 });

  const raw = await upstream.text();
  const html = injectScoringBridge(raw); // auto-scoring for every test, even uploads without a bridge
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // no-store so the latest scoring bridge is always served (never a stale copy)
      "Cache-Control": "no-store, must-revalidate",
    },
  });
}
