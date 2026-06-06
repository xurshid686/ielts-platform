// Backfills answer_key + total for tests uploaded BEFORE the 0002 migration.
// Run AFTER applying supabase/migrations/0002_answer_keys.sql.
//
//   node scripts/backfill-keys.mjs
//
// Requires SUPABASE_SERVICE_ROLE_KEY in .env.local (bypasses RLS to update rows).
//
// NOTE: the parsing below mirrors src/lib/ielts/extract-key.ts (which is unit
// tested). The CDI answer-key format is frozen, so the two stay in sync.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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
const normalizeAnswer = (s) =>
  String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

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
  const ws = () => { while (i < n && /\s/.test(s[i])) i++; };
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

// ---- run ----
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

const { data: tests, error } = await supabase
  .from("tests")
  .select("id, title, file_url, answer_key");
if (error) {
  console.error("Could not list tests:", error.message);
  process.exit(1);
}

let updated = 0, skipped = 0, failed = 0;
for (const t of tests) {
  if (t.answer_key && Object.keys(t.answer_key).length) { skipped++; continue; }
  try {
    const res = await fetch(t.file_url, { cache: "no-store" });
    if (!res.ok) { console.error(`Fetch failed (${t.title}): ${res.status}`); failed++; continue; }
    const html = await res.text();
    const ex = extractAnswerKey(html);
    if (!ex) { console.warn(`No key found (${t.title}) — left as fallback.`); failed++; continue; }
    const { error: upErr } = await supabase
      .from("tests")
      .update({ answer_key: ex.key, total: ex.total })
      .eq("id", t.id);
    if (upErr) { console.error(`Update failed (${t.title}): ${upErr.message}`); failed++; continue; }
    console.log(`Keyed: ${t.title}  (${ex.total} questions)`);
    updated++;
  } catch (e) {
    console.error(`Error (${t.title}):`, e.message);
    failed++;
  }
}

console.log(`\nDone. ${updated} updated, ${skipped} already keyed, ${failed} failed.`);
