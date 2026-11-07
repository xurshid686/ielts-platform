// Copy every Supabase Storage object into the private R2 bucket, and PROVE it.
//
// Why: Supabase restricted the live project for `exceed_cached_egress_quota`
// (2026-11-07). The app reads storage through src/lib/storage, which switches
// to R2 with STORAGE_BACKEND=r2 — but only once every object is there.
//
// The object list is Frankfurt's own `storage.objects` (via the pg pooler,
// which keeps working while the HTTP APIs are restricted). Each row carries the
// MD5 Supabase computed at upload (`metadata.eTag`), and a candidate file is
// accepted ONLY if its MD5 equals it. Same size or same name is never enough,
// so whatever lands in R2 is byte-identical to what the site served.
//
// Sources, tried in order for each object still missing from R2:
//   --dir=<folder>   any folder, searched recursively. A file is matched by its
//                    path (`<bucket>/<name>` at the end of it) or, failing
//                    that, by MD5 alone — so local originals with other names
//                    count too. Repeatable. Unzip a storage backup first.
//   --from-supabase  download from Supabase Storage (needs it unblocked).
//
//   node scripts/migrate-storage-to-r2.mjs --dry-run --dir="D:/backup"
//   node scripts/migrate-storage-to-r2.mjs --dir="D:/backup" --dir="X:/CDI READING PROJECT"
//   node scripts/migrate-storage-to-r2.mjs --from-supabase
//
// Idempotent: an object already in R2 with the right MD5 is skipped, so it can
// be re-run until the report says N/N. It never deletes anything, on either side.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, sep } from "node:path";
import { tmpdir } from "node:os";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./env.mjs";
import { r2Fetch as r2FetchOnce } from "./storage.mjs";

// A long run over a home connection meets the odd ECONNRESET; retry those, never an HTTP answer.
async function r2Fetch(bucket, path, init, tries = 5) {
  for (let i = 1; ; i++) {
    try {
      return await r2FetchOnce(bucket, path, init);
    } catch (e) {
      if (i >= tries) throw e;
      await new Promise((z) => setTimeout(z, 500 * 2 ** i));
    }
  }
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const fromSupabase = args.includes("--from-supabase");
const dirs = args.filter((a) => a.startsWith("--dir=")).map((a) => a.slice(6));
const manifestPath =
  args.find((a) => a.startsWith("--manifest="))?.slice(11) || join(tmpdir(), "storage-migration-manifest.json");
// Text files whose bytes a source may hold with different line endings never
// match MD5 and are simply left for --from-supabase; nothing is normalised.

const { url, serviceKey } = loadEnv();
const ref = process.env.NEW_PROJECT_REF;
const password = process.env.NEW_DB_PASS;
if (!ref || !password) {
  console.error("Need NEW_PROJECT_REF and NEW_DB_PASS (they are in .env.frankfurt).");
  process.exit(1);
}

const md5 = (buf) => createHash("md5").update(buf).digest("hex");
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

// ------------------------------------------------------------- the truth
const db = new pg.Client({
  host: "aws-0-eu-central-1.pooler.supabase.com",
  port: 5432,
  user: `postgres.${ref}`,
  password,
  database: "postgres",
  ssl: { rejectUnauthorized: false },
});
await db.connect();
const { rows } = await db.query(
  `select bucket_id, name, (metadata->>'size')::bigint as size,
          lower(trim(both '"' from metadata->>'eTag')) as etag,
          metadata->>'mimetype' as mime
     from storage.objects
    where name not like '%/.emptyFolderPlaceholder'
    order by bucket_id, name`,
);
await db.end();
console.log(`${rows.length} objects in Frankfurt storage.objects\n`);

const multipart = rows.filter((r) => !/^[0-9a-f]{32}$/.test(r.etag ?? ""));
if (multipart.length) {
  console.log(`${multipart.length} object(s) have no plain-MD5 eTag; only --from-supabase can verify them by size + R2 re-read.`);
}

// ------------------------------------------------------------- what R2 has
async function inR2(r) {
  const res = await r2Fetch(r.bucket_id, r.name, { method: "HEAD" });
  if (!res.ok) return false;
  const etag = (res.headers.get("etag") ?? "").replace(/"/g, "").toLowerCase();
  return etag === r.etag && Number(res.headers.get("content-length")) === Number(r.size);
}

// ------------------------------------------------------------- local sources
const byPath = new Map(); // "<bucket>/<name>" -> file
const byMd5 = new Map(); // md5 -> file (lazy: only files of a wanted size are hashed)
const wantedSizes = new Set(rows.map((r) => Number(r.size)));
const candidates = []; // { file, size }

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".git") continue;
      walk(p);
    } else if (e.isFile()) {
      const size = statSync(p).size;
      if (!wantedSizes.has(size)) continue;
      candidates.push({ file: p, size });
      const norm = p.split(sep).join("/");
      for (const r of rows) {
        const key = `${r.bucket_id}/${r.name}`;
        if (norm.endsWith("/" + key)) byPath.set(key, p);
      }
    }
  }
}
for (const d of dirs) {
  console.log(`scanning ${d} …`);
  walk(d);
}
let hashed = false;
function md5Index() {
  if (hashed) return;
  hashed = true;
  for (const c of candidates) {
    try {
      byMd5.set(md5(readFileSync(c.file)), c.file);
    } catch {
      /* unreadable file: skip */
    }
  }
}

// ------------------------------------------------------------- supabase source
const supabase = fromSupabase
  ? createClient(url, serviceKey, { auth: { persistSession: false } })
  : null;
async function fromStorage(r) {
  const { data, error } = await supabase.storage.from(r.bucket_id).download(r.name);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

// ------------------------------------------------------------- copy + prove
async function put(r, buf) {
  const res = await r2Fetch(r.bucket_id, r.name, {
    method: "PUT",
    headers: { "Content-Type": r.mime || "application/octet-stream" },
    body: new Uint8Array(buf),
  });
  if (!res.ok) throw new Error(`PUT ${res.status}`);
  // Read it BACK and compare — the upload's own success is not the proof.
  const back = await r2Fetch(r.bucket_id, r.name, { method: "GET" });
  if (!back.ok) throw new Error(`re-GET ${back.status}`);
  const got = Buffer.from(await back.arrayBuffer());
  if (got.length !== buf.length || sha256(got) !== sha256(buf)) throw new Error("re-read differs from source");
}

const manifest = [];
const tally = { already: 0, copied: 0, missing: 0, failed: 0 };
const missingByBucket = {};

for (const r of rows) {
  const key = `${r.bucket_id}/${r.name}`;
  const entry = { key, size: Number(r.size), etag: r.etag, status: "", source: "" };
  manifest.push(entry);

  if (await inR2(r)) {
    entry.status = "already";
    tally.already++;
    continue;
  }

  let buf = null;
  const verifiable = /^[0-9a-f]{32}$/.test(r.etag ?? "");
  const local = byPath.get(key);
  if (local && verifiable) {
    const b = readFileSync(local);
    if (md5(b) === r.etag) [buf, entry.source] = [b, local];
  }
  if (!buf && verifiable && dirs.length) {
    md5Index();
    const f = byMd5.get(r.etag);
    if (f) [buf, entry.source] = [readFileSync(f), f];
  }
  if (!buf && fromSupabase) {
    const b = await fromStorage(r);
    if (b && b.length === Number(r.size) && (!verifiable || md5(b) === r.etag)) [buf, entry.source] = [b, "supabase"];
  }

  if (!buf) {
    entry.status = "missing";
    tally.missing++;
    missingByBucket[r.bucket_id] = (missingByBucket[r.bucket_id] ?? 0) + 1;
    continue;
  }
  if (dryRun) {
    entry.status = "would-copy";
    tally.copied++;
    continue;
  }
  try {
    await put(r, buf);
    entry.status = "copied";
    tally.copied++;
  } catch (e) {
    entry.status = `failed: ${e.message}`;
    tally.failed++;
  }
}

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
const total = rows.length;
const done = tally.already + (dryRun ? 0 : tally.copied);
console.log(
  `\n${dryRun ? "[dry run] " : ""}already in R2 ${tally.already} · ${dryRun ? "would copy" : "copied"} ${tally.copied} · missing ${tally.missing} · failed ${tally.failed}`,
);
if (tally.missing) console.log("missing by bucket:", missingByBucket);
console.log(`manifest: ${manifestPath}`);
console.log(`\n${done}/${total} verified in R2${done === total ? " — safe to switch STORAGE_BACKEND=r2" : " — do NOT switch yet"}`);
process.exitCode = done === total ? 0 : 2;
