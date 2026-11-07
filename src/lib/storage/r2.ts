import "server-only";
import { AwsClient } from "aws4fetch";
import type { FileStore, StorageError } from "./index";

/**
 * Cloudflare R2 behind the `FileStore` shape (see ./index.ts).
 *
 * One PRIVATE R2 bucket (`R2_FILES_BUCKET`, default `mockonline-files`) holds
 * every old Supabase bucket as a key prefix: Supabase `tests/reading/x.html`
 * is R2 `tests/reading/x.html`. Nothing is public; browsers only ever get a
 * short-lived presigned URL, exactly as they got a Supabase signed URL.
 */

let cached: AwsClient | null = null;

function client(): AwsClient {
  if (cached) return cached;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey || !process.env.R2_ACCOUNT_ID) {
    throw new Error("R2 is not configured (R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY).");
  }
  cached = new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" });
  return cached;
}

function endpoint(): string {
  const bucket = process.env.R2_FILES_BUCKET || "mockonline-files";
  return `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${bucket}`;
}

/** `<bucket>/<path>`, each segment percent-encoded (paths are UUIDs today, but stay safe). */
export function objectKey(bucket: string, path: string): string {
  return [bucket, ...path.split("/")].map(encodeURIComponent).join("/");
}

function err(message: string): StorageError {
  return { message };
}

async function failure(res: Response, what: string): Promise<StorageError> {
  const body = await res.text().catch(() => "");
  const code = /<Code>([^<]+)<\/Code>/.exec(body)?.[1];
  return err(`${what} failed: ${res.status}${code ? ` ${code}` : ""}`);
}

function toBody(body: Blob | ArrayBuffer | Uint8Array | Buffer): BodyInit {
  if (body instanceof Blob || body instanceof ArrayBuffer) return body;
  // Copy into a plain ArrayBuffer: a Buffer can be a view over a larger pool.
  return new Uint8Array(body).buffer as ArrayBuffer;
}

/** Decodes the five XML entities S3 escapes in `<Key>`. */
function xmlText(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

export async function presign(bucket: string, path: string, expiresIn: number): Promise<string> {
  const url = new URL(`${endpoint()}/${objectKey(bucket, path)}`);
  // SigV4 query signing caps at 7 days; Supabase callers here ask for ≤ 3 h.
  url.searchParams.set("X-Amz-Expires", String(Math.max(1, Math.min(604800, Math.floor(expiresIn)))));
  const signed = await client().sign(url.toString(), { method: "GET", aws: { signQuery: true } });
  return signed.url;
}

export function r2Bucket(bucket: string): FileStore {
  const base = endpoint();
  const url = (path: string) => `${base}/${objectKey(bucket, path)}`;

  return {
    async upload(path, body, opts) {
      try {
        const contentType =
          opts?.contentType || (body instanceof Blob && body.type) || "application/octet-stream";
        const headers: Record<string, string> = { "Content-Type": contentType };
        // Supabase's `upsert: false` refuses to overwrite; R2 honours the same
        // conditional PUT, so a path collision fails here as it did there.
        if (!opts?.upsert) headers["If-None-Match"] = "*";
        const res = await client().fetch(url(path), { method: "PUT", headers, body: toBody(body) });
        if (res.status === 412) return { error: err("The resource already exists") };
        if (!res.ok) return { error: await failure(res, "Upload") };
        return { error: null };
      } catch (e) {
        return { error: err(e instanceof Error ? e.message : String(e)) };
      }
    },

    async download(path) {
      try {
        const res = await client().fetch(url(path), { method: "GET" });
        if (!res.ok) return { data: null, error: await failure(res, "Download") };
        const buf = await res.arrayBuffer();
        const type = res.headers.get("content-type") ?? "";
        return { data: new Blob([buf], { type }), error: null };
      } catch (e) {
        return { data: null, error: err(e instanceof Error ? e.message : String(e)) };
      }
    },

    async remove(paths) {
      try {
        for (const p of paths) {
          const res = await client().fetch(url(p), { method: "DELETE" });
          // 204 on success; a missing key is also 204 on R2, matching Supabase's no-op.
          if (!res.ok && res.status !== 404) return { error: await failure(res, "Remove") };
        }
        return { error: null };
      } catch (e) {
        return { error: err(e instanceof Error ? e.message : String(e)) };
      }
    },

    async list(prefix) {
      // Supabase `list(folder)` is one level deep and returns bare names.
      try {
        const folder = `${bucket}/${prefix.replace(/^\/+|\/+$/g, "")}/`;
        const names: string[] = [];
        let token: string | undefined;
        do {
          const q = new URL(base);
          q.searchParams.set("list-type", "2");
          q.searchParams.set("prefix", folder);
          q.searchParams.set("delimiter", "/");
          if (token) q.searchParams.set("continuation-token", token);
          const res = await client().fetch(q.toString(), { method: "GET" });
          if (!res.ok) return { data: null, error: await failure(res, "List") };
          const xml = await res.text();
          for (const m of xml.matchAll(/<Contents>[\s\S]*?<Key>([^<]+)<\/Key>[\s\S]*?<\/Contents>/g)) {
            names.push(xmlText(m[1]).slice(folder.length));
          }
          token = /<IsTruncated>true<\/IsTruncated>/.test(xml)
            ? xmlText(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/.exec(xml)?.[1] ?? "")
            : undefined;
        } while (token);
        return { data: names.filter(Boolean).map((name) => ({ name })), error: null };
      } catch (e) {
        return { data: null, error: err(e instanceof Error ? e.message : String(e)) };
      }
    },

    async createSignedUrl(path, expiresIn) {
      try {
        return { data: { signedUrl: await presign(bucket, path, expiresIn) }, error: null };
      } catch (e) {
        return { data: null, error: err(e instanceof Error ? e.message : String(e)) };
      }
    },

    async createSignedUrls(paths, expiresIn) {
      try {
        const data = await Promise.all(
          paths.map(async (p) => ({ path: p, signedUrl: await presign(bucket, p, expiresIn), error: null })),
        );
        return { data, error: null };
      } catch (e) {
        return { data: null, error: err(e instanceof Error ? e.message : String(e)) };
      }
    },
  };
}
