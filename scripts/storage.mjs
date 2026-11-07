// The scripts' door to file storage — the twin of src/lib/storage/.
//
// Supabase restricted the live project for `exceed_cached_egress_quota`
// (2026-11-07), so files moved to one PRIVATE Cloudflare R2 bucket, keyed
// `<old supabase bucket>/<path>`. `fileStore(bucket, supabase)` answers with
// supabase-js's `storage.from(bucket)` shapes, so a script changes by one line.
//
// Backend: STORAGE_BACKEND=r2 (environment or the env file loadEnv() read)
// switches to R2; anything else keeps Supabase. The R2_* credentials are
// looked up in the environment, then .env.local, where they have always lived.
//
//   node scripts/upload-listening.mjs ...                    -> whatever STORAGE_BACKEND says
//   STORAGE_BACKEND=r2 node scripts/upload-listening.mjs ... -> R2
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AwsClient } from "aws4fetch";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const R2_NAMES = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_FILES_BUCKET"];

function fillR2Env() {
  if (R2_NAMES.slice(0, 3).every((n) => process.env[n])) return;
  try {
    for (const line of readFileSync(join(root, ".env.local"), "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && R2_NAMES.includes(m[1]) && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
      }
    }
  } catch {
    /* fall through to the check below */
  }
}

export function storageBackend() {
  return process.env.STORAGE_BACKEND === "r2" ? "r2" : "supabase";
}

let client = null;
function r2() {
  if (client) return client;
  fillR2Env();
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new Error("R2 is not configured (R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY).");
  }
  client = new AwsClient({
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
    service: "s3",
    region: "auto",
  });
  return client;
}

export function r2Endpoint() {
  fillR2Env();
  const bucket = process.env.R2_FILES_BUCKET || "mockonline-files";
  return `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${bucket}`;
}

export function objectKey(bucket, path) {
  return [bucket, ...path.split("/")].map(encodeURIComponent).join("/");
}

/** Raw signed request against the R2 bucket — for the migration script. */
export function r2Fetch(bucket, path, init) {
  return r2().fetch(`${r2Endpoint()}/${objectKey(bucket, path)}`, init);
}

function asBody(body) {
  if (typeof body === "string") return new TextEncoder().encode(body);
  if (body instanceof Blob || body instanceof ArrayBuffer) return body;
  return new Uint8Array(body); // Buffer / Uint8Array: copy out of any shared pool
}

async function failure(res, what) {
  const text = await res.text().catch(() => "");
  const code = /<Code>([^<]+)<\/Code>/.exec(text)?.[1];
  return { message: `${what} failed: ${res.status}${code ? ` ${code}` : ""}` };
}

function r2Bucket(bucket) {
  return {
    async upload(path, body, opts = {}) {
      const contentType = opts.contentType || (body instanceof Blob && body.type) || "application/octet-stream";
      const headers = { "Content-Type": contentType };
      if (!opts.upsert) headers["If-None-Match"] = "*";
      const res = await r2Fetch(bucket, path, { method: "PUT", headers, body: asBody(body) });
      if (res.status === 412) return { error: { message: "The resource already exists" } };
      return { error: res.ok ? null : await failure(res, "Upload") };
    },
    async download(path) {
      const res = await r2Fetch(bucket, path, { method: "GET" });
      if (!res.ok) return { data: null, error: await failure(res, "Download") };
      const buf = await res.arrayBuffer();
      return { data: new Blob([buf], { type: res.headers.get("content-type") ?? "" }), error: null };
    },
    async remove(paths) {
      for (const p of paths) {
        const res = await r2Fetch(bucket, p, { method: "DELETE" });
        if (!res.ok && res.status !== 404) return { error: await failure(res, "Remove") };
      }
      return { error: null };
    },
    // `file_url` is vestigial (see src/lib/tests/create.ts); the path is what it holds now.
    getPublicUrl(path) {
      return { data: { publicUrl: path } };
    },
  };
}

export function fileStore(bucket, supabase) {
  return storageBackend() === "r2" ? r2Bucket(bucket) : supabase.storage.from(bucket);
}
