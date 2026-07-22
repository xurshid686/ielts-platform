// Validates every CDI reading HTML in a folder and (with --apply) uploads the
// good ones to Supabase as PREMIUM tests (tier=premium, is_public=false).
//
//   node scripts/upload-premium-batch.mjs "X:\\CDI READING PROJECT"            # dry-run: validate + report
//   node scripts/upload-premium-batch.mjs "X:\\CDI READING PROJECT" --apply    # upload everything that passed
//   node scripts/upload-premium-batch.mjs "X:\\CDI READING PROJECT" --apply --only "Arctic Warming"
//
// Filename convention: "<Title> Passage <N> by <agent>.html" or "<Title> Full Test by <agent>.html".
// The stored title is ONLY the title (agent + "Passage N"/"Full Test" stripped);
// passage/kind go in their own columns. De-dupes by title+skill on re-run.
// Requires SUPABASE_SERVICE_ROLE_KEY in .env.local.
import { readFileSync, readdirSync } from "node:fs";
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

// ---- key extraction (same as upload-public-test.mjs / src/lib/ielts/extract-key.ts) ----
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

// ---- filename parsing ----
function parseName(file) {
  let name = basename(file).replace(/\.html$/i, "").trim();
  const agentM = name.match(/\s+by\s+(\w+)$/i);
  const agent = agentM ? agentM[1].toLowerCase() : null;
  if (agentM) name = name.slice(0, agentM.index).trim();
  let kind = "single", passage = null;
  const fullM = name.match(/\s+Full\s*Test$/i);
  const passM = name.match(/\s+Passage\s*([123])$/i);
  if (fullM) { kind = "full"; name = name.slice(0, fullM.index).trim(); }
  else if (passM) { passage = Number(passM[1]); name = name.slice(0, passM.index).trim(); }
  return { title: name, kind, passage, agent };
}

// ---- validation ----
function validate(html, meta) {
  const problems = [];
  const warnings = [];
  const ex = extractAnswerKey(html);
  if (!ex) return { ok: false, problems: ["no extractable answer key"], warnings, ex: null };

  const nums = Object.keys(ex.key).map(Number).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  const nonNumeric = Object.keys(ex.key).filter((k) => !Number.isFinite(Number(k)));
  if (nonNumeric.length) warnings.push(`non-numeric question ids: ${nonNumeric.join(", ")}`);

  // Contiguity
  const gaps = [];
  for (let i = 1; i < nums.length; i++) if (nums[i] !== nums[i - 1] + 1) gaps.push(`${nums[i - 1]}→${nums[i]}`);
  if (gaps.length) problems.push(`question number gaps: ${gaps.join(", ")}`);

  // Expected totals
  if (meta.kind === "full") {
    if (ex.total !== 40) problems.push(`full test has ${ex.total} answers (expected 40)`);
  } else {
    if (ex.total < 12 || ex.total > 14) problems.push(`passage has ${ex.total} answers (expected 12–14)`);
  }

  // Empty answers
  const empty = Object.entries(ex.key).filter(([, v]) => !v.length).map(([k]) => k);
  if (empty.length) problems.push(`empty answers for: ${empty.join(", ")}`);

  // Every keyed question should appear as a question element in the HTML
  const missing = [];
  for (const q of nums) {
    const re = new RegExp(`(data-question|data-q|id|name)=["']?(q|q-|question-)?${q}["'\\s>]`, "i");
    if (!re.test(html)) missing.push(q);
  }
  if (missing.length) warnings.push(`no obvious input element for q: ${missing.join(", ")}`);

  return { ok: problems.length === 0, problems, warnings, ex };
}

// ---- args ----
const argv = process.argv.slice(2);
const positional = [];
const flags = {};
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith("--")) {
    const k = argv[i].slice(2);
    if (k === "apply") flags.apply = true;
    else flags[k] = argv[++i];
  } else positional.push(argv[i]);
}
// Agent preference for resolving duplicate versions (best first), and titles to
// HOLD (never upload) because a human still needs to adjudicate their answer key.
const PRIORITY = (flags.priority || "codex,claude,gemini,grok").split(",").map((s) => s.trim().toLowerCase());
const HOLD = (flags.hold || "The Burgess Shale fossils").split(";").map((s) => s.trim().toLowerCase()).filter(Boolean);
const dir = positional[0];
if (!dir) { console.error("Usage: node scripts/upload-premium-batch.mjs <folder> [--apply] [--only <title substr>]"); process.exit(1); }

const files = readdirSync(dir)
  .filter((f) => /\.html$/i.test(f) && !/-\s*SOURCE\.html$/i.test(f))
  .map((f) => join(dir, f));

const entries = [];
for (const f of files) {
  const meta = parseName(f);
  if (flags.only && !meta.title.toLowerCase().includes(flags.only.toLowerCase())) continue;
  const html = readFileSync(f, "utf8");
  const v = validate(html, meta);
  entries.push({ file: f, ...meta, ...v, html });
}

// ---- report ----
const byTitle = new Map();
for (const e of entries) {
  const k = `${e.title}::${e.kind}::${e.passage}`;
  if (!byTitle.has(k)) byTitle.set(k, []);
  byTitle.get(k).push(e);
}

let pass = 0, fail = 0;
for (const e of entries) {
  const tag = e.ok ? "PASS" : "FAIL";
  e.ok ? pass++ : fail++;
  console.log(`[${tag}] ${e.title}${e.passage ? ` (P${e.passage})` : e.kind === "full" ? " (FULL)" : ""} — by ${e.agent} — ${e.ex ? e.ex.total + " answers" : "no key"}`);
  for (const p of e.problems) console.log(`       ✗ ${p}`);
  for (const w of e.warnings) console.log(`       ⚠ ${w}`);
}
const dups = [...byTitle.entries()].filter(([, v]) => v.length > 1);
if (dups.length) {
  console.log(`\nDuplicates (only ONE of each may be uploaded — use --only or remove a file):`);
  for (const [k, v] of dups) console.log(`  ${k.split("::")[0]}: ${v.map((e) => e.agent).join(" vs ")}`);
}
console.log(`\n${pass} pass, ${fail} fail, ${entries.length} total.`);

if (!flags.apply) { console.log("Dry-run only. Re-run with --apply to upload the passing tests."); process.exit(0); }

// ---- upload ----
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) { console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local"); process.exit(1); }
const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

for (const [k, group] of byTitle) {
  const title = k.split("::")[0];
  if (HOLD.includes(title.toLowerCase())) { console.log(`HOLD (needs human review): ${title}`); continue; }
  // Resolve duplicates by agent priority.
  let v = group;
  if (group.length > 1) {
    const sorted = [...group].sort((a, b) => {
      const ia = PRIORITY.indexOf(a.agent), ib = PRIORITY.indexOf(b.agent);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    console.log(`RESOLVE duplicate "${title}": chose ${sorted[0].agent} over ${sorted.slice(1).map((e) => e.agent).join(", ")}`);
    v = [sorted[0]];
  }
  const e = v[0];
  if (!e.ok) { console.log(`SKIP (failed validation): ${e.title}`); continue; }

  const storagePath = `reading/premium-${randomUUID()}.html`;
  const { error: upErr } = await supabase.storage
    .from("tests")
    .upload(storagePath, Buffer.from(e.html, "utf8"), { contentType: "text/html", upsert: false });
  if (upErr) { console.error(`UPLOAD FAILED: ${e.title}: ${upErr.message}`); continue; }
  const { data: pub } = supabase.storage.from("tests").getPublicUrl(storagePath);

  // De-dupe on the natural key title+skill+kind+passage so a "Full Test" and a
  // same-titled "Passage N" don't clobber each other (old storage object left in place).
  let del = supabase.from("tests").delete().eq("title", e.title).eq("skill", "reading").eq("kind", e.kind);
  del = e.passage == null ? del.is("passage", null) : del.eq("passage", e.passage);
  await del;

  const row = {
    title: e.title,
    skill: "reading",
    kind: e.kind,
    tier: "premium",
    level: null,
    passage: e.passage,
    file_url: pub.publicUrl,
    file_path: storagePath,
    answer_key: e.ex.key,
    total: e.ex.total,
    is_public: false,
  };
  const { data: inserted, error: insErr } = await supabase.from("tests").insert(row).select("id").single();
  if (insErr) {
    await supabase.storage.from("tests").remove([storagePath]);
    console.error(`INSERT FAILED: ${e.title}: ${insErr.message}`);
    continue;
  }
  console.log(`✅ ${e.title}${e.passage ? ` (P${e.passage})` : e.kind === "full" ? " (FULL)" : ""} → ${inserted.id}`);
}
