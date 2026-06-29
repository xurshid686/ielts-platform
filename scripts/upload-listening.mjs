// One-off: upload a single cdi-listening-master HTML test to Supabase (storage +
// `tests` row) with its answer key, exactly like the admin uploadTest action.
// Usage: node scripts/upload-listening.mjs "<path-to.html>" "<Title>"
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadEnv() {
  try {
    for (const line of readFileSync(join(root, ".env.local"), "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {}
}
loadEnv();

// --- pure parser, ported 1:1 from src/lib/ielts/extract-key.ts ---
const normalizeAnswer = (s) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
function sliceObjectLiteral(src, ident) {
  const m = new RegExp(`${ident}\\s*=`).exec(src);
  if (!m) return null;
  const open = src.indexOf("{", m.index + m[0].length);
  if (open < 0) return null;
  let depth = 0, inStr = false, quote = "", esc = false;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === quote) inStr = false; continue; }
    if (c === "'" || c === '"' || c === "`") { inStr = true; quote = c; }
    else if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return src.slice(open, i + 1); }
  }
  return null;
}
function parseObjectLiteral(body) {
  const out = {}, s = body, n = s.length; let i = 0;
  const ws = () => { while (i < n && /\s/.test(s[i])) i++; };
  const readString = () => { const q = s[i++]; let r = ""; while (i < n) { const c = s[i++]; if (c === "\\") r += s[i++] ?? ""; else if (c === q) break; else r += c; } return r; };
  while (i < n && s[i] !== "{") i++; i++; ws();
  while (i < n && s[i] !== "}") {
    ws();
    let key = "";
    if (s[i] === "'" || s[i] === '"' || s[i] === "`") key = readString();
    else while (i < n && /[^\s:]/.test(s[i])) key += s[i++];
    ws(); if (s[i] !== ":") break; i++; ws();
    let vals = [];
    if (s[i] === "[") {
      i++; ws();
      while (i < n && s[i] !== "]") { ws(); if (s[i] === "'" || s[i] === '"' || s[i] === "`") vals.push(readString()); else { let v = ""; while (i < n && /[^\s,\]]/.test(s[i])) v += s[i++]; if (v) vals.push(v); } ws(); if (s[i] === ",") i++; ws(); }
      i++;
    } else if (s[i] === "'" || s[i] === '"' || s[i] === "`") vals = [readString()];
    else { let v = ""; while (i < n && /[^\s,}]/.test(s[i])) v += s[i++]; if (v) vals = [v]; }
    const k = key.trim(); if (k) out[k] = vals;
    ws(); if (s[i] === ",") i++; ws();
  }
  return out;
}
function extractAnswerKey(html) {
  let body = sliceObjectLiteral(html, "acceptableAnswers") || sliceObjectLiteral(html, "correctAnswers");
  if (!body) body = sliceObjectLiteral(html, "\\bKEY");
  if (!body) return null;
  const parsed = parseObjectLiteral(body);
  const key = {};
  for (const [q, list] of Object.entries(parsed)) {
    const norm = [...new Set(list.map(normalizeAnswer).filter(Boolean))];
    if (norm.length) key[q] = norm;
  }
  const total = Object.keys(key).length;
  return total ? { key, total } : null;
}

const [, , filePath, titleArg] = process.argv;
if (!filePath) { console.error("Usage: node scripts/upload-listening.mjs <path.html> <title>"); process.exit(1); }
const title = (titleArg || "Cambridge 21 — Listening Test 1").trim();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) { console.error("Missing Supabase env"); process.exit(1); }

const html = readFileSync(filePath, "utf8");
const extracted = extractAnswerKey(html);
if (!extracted) { console.error("Could not extract an answer key from the HTML."); process.exit(1); }
console.log(`Extracted ${extracted.total} questions. Q21 key:`, extracted.key["21"], "Q40 key:", extracted.key["40"]);

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
const skill = "listening";
const storagePath = `${skill}/${randomUUID()}.html`;

const { error: upErr } = await supabase.storage.from("tests").upload(storagePath, Buffer.from(html, "utf8"), { contentType: "text/html", upsert: false });
if (upErr) { console.error("Upload failed:", upErr.message); process.exit(1); }
const { data: pub } = supabase.storage.from("tests").getPublicUrl(storagePath);

// Remove any earlier copy with the same title so re-runs don't duplicate.
await supabase.from("tests").delete().eq("title", title).eq("skill", skill);

const row = {
  title, skill, kind: "full", tier: "free", track: "regular",
  question_types: ["Note completion", "Table completion", "Multiple choice", "Matching"],
  level: null, passage: null,
  file_url: pub.publicUrl, file_path: storagePath,
  answer_key: extracted.key, total: extracted.total,
};
let { error: insErr } = await supabase.from("tests").insert(row);
if (insErr && /track/.test(insErr.message)) { delete row.track; ({ error: insErr } = await supabase.from("tests").insert(row)); }
if (insErr) { await supabase.storage.from("tests").remove([storagePath]); console.error("Insert failed:", insErr.message); process.exit(1); }

console.log(`\n✅ Uploaded "${title}" (${skill}, full, ${extracted.total} questions).`);
console.log(`   storage: ${storagePath}`);
