// Uploads a single CDI test HTML to Supabase Storage + inserts a `tests` row
// flagged is_public = true, so it can be shared and taken WITHOUT login at
// /practice/[id]. Extracts the answer key so the platform grades it server-side.
//
//   node scripts/upload-public-test.mjs "X:\\CDI READING PROJECT\\Orientation of birds Passage 2 by codex.html"
//
// Optional flags: --title "..." --skill reading|listening --passage 2 --level "Band 6–7"
// Requires SUPABASE_SERVICE_ROLE_KEY in .env.local (bypasses RLS). Run AFTER
// applying supabase/migrations/0033_public_tests.sql.
import { readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

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

// ---- key extraction (port of src/lib/ielts/extract-key.ts) ----
const normalizeAnswer = (s) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

function sliceObjectLiteral(src, ident) {
  const re = new RegExp(`${ident}\\s*=`);
  const m = re.exec(src);
  if (!m) return null;
  const open = src.indexOf("{", m.index + m[0].length);
  if (open < 0) return null;
  let depth = 0, inStr = false, quote = "", esc = false;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === quote) inStr = false;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") { inStr = true; quote = c; }
    else if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return src.slice(open, i + 1); }
  }
  return null;
}

function parseObjectLiteral(body) {
  const out = {};
  const s = body, n = s.length;
  let i = 0;
  // Skips whitespace AND // line / /* block */ comments - CDI keys carry inline
  // comments explaining variants, and stopping at one truncates the key.
  const ws = () => {
    for (;;) {
      while (i < n && /\s/.test(s[i])) i++;
      if (s[i] === "/" && s[i + 1] === "/") { while (i < n && s[i] !== "\n") i++; }
      else if (s[i] === "/" && s[i + 1] === "*") { i += 2; while (i < n && !(s[i] === "*" && s[i + 1] === "/")) i++; i += 2; }
      else return;
    }
  };
  const readString = () => {
    const q = s[i++]; let r = "";
    while (i < n) {
      const c = s[i++];
      if (c === "\\") r += s[i++] ?? "";
      else if (c === q) break;
      else r += c;
    }
    return r;
  };
  while (i < n && s[i] !== "{") i++;
  i++; ws();
  while (i < n && s[i] !== "}") {
    ws();
    let key = "";
    if (s[i] === "'" || s[i] === '"' || s[i] === "`") key = readString();
    else while (i < n && /[^\s:]/.test(s[i])) key += s[i++];
    ws();
    if (s[i] !== ":") break;
    i++; ws();
    let vals = [];
    if (s[i] === "[") {
      i++; ws();
      while (i < n && s[i] !== "]") {
        ws();
        if (s[i] === "'" || s[i] === '"' || s[i] === "`") vals.push(readString());
        else { let v = ""; while (i < n && /[^\s,\]]/.test(s[i])) v += s[i++]; if (v) vals.push(v); }
        ws(); if (s[i] === ",") i++; ws();
      }
      i++;
    } else if (s[i] === "'" || s[i] === '"' || s[i] === "`") {
      vals = [readString()];
    } else {
      let v = ""; while (i < n && /[^\s,}]/.test(s[i])) v += s[i++]; if (v) vals = [v];
    }
    const k = key.trim();
    if (k) out[k] = vals;
    ws(); if (s[i] === ",") i++; ws();
  }
  return out;
}

function extractAnswerKey(html) {
  const correctBody = sliceObjectLiteral(html, "correctAnswers");
  const acceptBody = sliceObjectLiteral(html, "acceptableAnswers");
  if (!correctBody && !acceptBody) return null;
  const correct = correctBody ? parseObjectLiteral(correctBody) : {};
  const accept = acceptBody ? parseObjectLiteral(acceptBody) : {};
  const qs = new Set([...Object.keys(correct), ...Object.keys(accept)]);
  const key = {};
  for (const q of qs) {
    const list = accept[q]?.length ? accept[q] : correct[q] ?? [];
    const norm = [...new Set(list.map(normalizeAnswer).filter(Boolean))];
    if (norm.length) key[q] = norm;
  }
  const total = Object.keys(key).length;
  return total ? { key, total } : null;
}

// ---- args ----
const argv = process.argv.slice(2);
const positional = [];
const flags = {};
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith("--")) flags[argv[i].slice(2)] = argv[++i];
  else positional.push(argv[i]);
}
const filePath =
  positional[0] || "X:\\CDI READING PROJECT\\Orientation of birds Passage 2 by codex.html";
const skill = flags.skill === "listening" ? "listening" : "reading";
const title =
  flags.title || basename(filePath).replace(/\.html$/i, "").replace(/\s+by\s+\w+$/i, "").trim();
const passage = flags.passage ? Number(flags.passage) : null;
const level = flags.level || null;

// ---- run ----
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

let buf;
try {
  buf = readFileSync(filePath);
} catch (e) {
  console.error(`Cannot read ${filePath}: ${e.message}`);
  process.exit(1);
}

const ex = extractAnswerKey(buf.toString("utf8"));
if (!ex) {
  console.error("No answer key found in the HTML — refusing to publish a public test that can't be graded server-side.");
  process.exit(1);
}
console.log(`Extracted key: ${ex.total} questions (${Object.keys(ex.key).join(", ")}).`);

const storagePath = `${skill}/public-${randomUUID()}.html`;
const { error: upErr } = await supabase.storage
  .from("tests")
  .upload(storagePath, buf, { contentType: "text/html", upsert: false });
if (upErr) {
  console.error(`Upload failed: ${upErr.message}`);
  process.exit(1);
}
const { data: pub } = supabase.storage.from("tests").getPublicUrl(storagePath);

// De-dupe on re-run: remove any prior row with the same title + skill.
await supabase.from("tests").delete().eq("title", title).eq("skill", skill);

const row = {
  title,
  skill,
  kind: "single",
  tier: "free",
  level,
  passage,
  file_url: pub.publicUrl,
  file_path: storagePath,
  answer_key: ex.key,
  total: ex.total,
  is_public: true,
};

const { data: inserted, error: insErr } = await supabase
  .from("tests")
  .insert(row)
  .select("id")
  .single();
if (insErr) {
  await supabase.storage.from("tests").remove([storagePath]);
  console.error(`Insert failed: ${insErr.message}`);
  process.exit(1);
}

console.log(`\n✅ Published: "${title}" (${skill})`);
console.log(`   Test id:     ${inserted.id}`);
console.log(`   Public link: ${process.env.NEXT_PUBLIC_SITE_URL || "<your-site>"}/practice/${inserted.id}`);
