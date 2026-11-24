import { avatarPath, avatarStore } from "@/lib/avatar";
import { sniffPhotoType } from "@/lib/profile-name";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Public: a profile photo is already public on the leaderboard and /u/[id].
 * The bytes (~20 KB WebP or JPEG) are streamed rather than redirected to a presigned
 * URL, so a cached response can never point at an expired link. A request
 * carrying ?v= is immutable: a new upload changes the stamp in avatar_url.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return new Response("Not found", { status: 404 });

  const { data, error } = await avatarStore().download(avatarPath(id));
  if (error || !data) {
    return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  const versioned = new URL(req.url).searchParams.has("v");
  const bytes = await data.arrayBuffer();
  // Type from the bytes, never from storage metadata: only WebP/JPEG were ever accepted.
  const type = sniffPhotoType(new Uint8Array(bytes, 0, Math.min(16, bytes.byteLength)));
  if (!type) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": type,
      "Content-Length": String(bytes.byteLength),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": versioned ? "public, max-age=31536000, immutable" : "public, max-age=300",
    },
  });
}
