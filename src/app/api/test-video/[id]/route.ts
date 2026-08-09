import { createAdminClient } from "@/lib/supabase/admin";
import { resolveTestAccess } from "@/lib/tests/access";

const BUCKET = "test-media";
const OBJECT = "reading-intro.mp4";

/**
 * Serves the pre-test briefing video that gates a test's start screen.
 *
 * The MP4 lives in a PRIVATE storage bucket and this is the only way to it, so
 * there is no shareable URL to pass around — the old public r2.dev link is
 * switched off. Entitlement comes from the same `resolveTestAccess` helper that
 * guards the test file and its answer key, so a premium test's video is exactly
 * as reachable as the test itself and no more.
 *
 * What this does NOT do: stop a determined viewer. Anyone entitled to watch can
 * screen-record, and devtools can save whatever the browser downloaded. Only DRM
 * (Cloudflare Stream / Widevine) raises that bar, and even that loses to a phone
 * camera. This closes link-sharing and casual saving, which is the realistic win.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const access = await resolveTestAccess(id);
  if (!access.ok) return new Response(access.message, { status: access.status });

  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(BUCKET).download(OBJECT);
  if (error || !data) {
    console.error(`[test-video] download failed for ${id}: ${error?.message}`);
    return new Response("Upstream error", { status: 502 });
  }

  // The player fetches the whole file up front and plays it from memory, so a
  // single 200 is enough — no Range handling needed, and advertising none keeps
  // media players from probing for one.
  const bytes = await data.arrayBuffer();
  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": "video/mp4",
      // Set explicitly: without it the player cannot show a percentage and falls
      // back to counting megabytes, which reads as if it were stuck.
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": "inline",
      "Accept-Ranges": "none",
      "X-Content-Type-Options": "nosniff",
      // no-store keeps it out of the on-disk HTTP cache; the gate only shows the
      // video once per test per browser anyway, so this costs almost nothing.
      "Cache-Control": "private, no-store, must-revalidate",
    },
  });
}
