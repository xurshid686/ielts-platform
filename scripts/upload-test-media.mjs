// Uploads a media file (the pre-test briefing video) to the PRIVATE `test-media`
// Supabase Storage bucket, creating the bucket if it does not exist.
//
//   node scripts/upload-test-media.mjs "X:\\CDI READING PROJECT\\reading Video.mp4" reading-intro.mp4
//
// The bucket is private on purpose: /api/test-video/[id] is the only way in, and
// it applies the same entitlement check as the test itself. Requires
// SUPABASE_SERVICE_ROLE_KEY in .env.local.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  try {
    const txt = readFileSync(join(root, ".env.local"), "utf8");
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {}
}
loadEnv();

const BUCKET = "test-media";
const [src, key = "reading-intro.mp4"] = process.argv.slice(2);
if (!src) {
  console.error('Usage: node scripts/upload-test-media.mjs "<file>" [key]');
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !service) {
  console.error("missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const supabase = createClient(url, service, { auth: { persistSession: false } });

const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
if (listErr) {
  console.error("listBuckets failed:", listErr.message);
  process.exit(1);
}
if (!buckets.some((b) => b.name === BUCKET)) {
  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: false,
    // 50MB is the project-wide ceiling on this plan; asking for more is rejected outright
    fileSizeLimit: "50MB",
    allowedMimeTypes: ["video/mp4", "image/jpeg", "image/png"],
  });
  if (error) {
    console.error("createBucket failed:", error.message);
    process.exit(1);
  }
  console.log(`created private bucket: ${BUCKET}`);
} else {
  console.log(`bucket already exists: ${BUCKET}`);
}

const body = readFileSync(src);
const { error: upErr } = await supabase.storage.from(BUCKET).upload(key, body, {
  contentType: "video/mp4",
  upsert: true,
  cacheControl: "3600",
});
if (upErr) {
  console.error("upload failed:", upErr.message);
  process.exit(1);
}
console.log(`uploaded ${key} (${body.length} bytes) to ${BUCKET} [private]`);
