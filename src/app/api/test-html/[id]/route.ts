import { createClient } from "@/lib/supabase/server";
import { injectScoringBridge } from "@/lib/ielts/scoring-bridge";
import { canAccessTest } from "@/lib/premium";

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

  const { data: test } = await supabase
    .from("tests")
    .select("file_url, tier")
    .eq("id", id)
    .single();

  const row = test as { file_url?: string; tier?: string } | null;
  const fileUrl = row?.file_url;
  if (!fileUrl) return new Response("Not found", { status: 404 });

  // Premium gate: premium test content is served only to subscribers/admins.
  if (row?.tier === "premium") {
    const { data: prof } = await supabase
      .from("profiles")
      .select("role, premium_until")
      .eq("id", user.id)
      .single();
    const profile = (prof as { role?: string; premium_until?: string | null } | null) ?? {
      role: "student",
      premium_until: null,
    };
    if (!canAccessTest({ role: profile.role ?? "student", premium_until: profile.premium_until ?? null }, { tier: "premium" })) {
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
