// Match built PDFs that have NO exact title match to site tests by passage TEXT.
//
//   node scripts/match-pdfs-by-text.mjs --dir="X:/CDI READING PROJECT/Ultima pdfs" --out=map.json
//
// For each manifest entry the title match cannot place, take the first ~14 words of the passage's
// first paragraph and look for them in the stored file of every site reading test that has no PDF
// yet. A PDF is matched only if EXACTLY ONE site test contains that text; anything else is listed,
// never guessed. Writes {cdiId: testId} for upload-test-pdfs.mjs --map=...
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./env.mjs";
import { fileStore } from "./storage.mjs";

const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const dir = arg("dir"), out = arg("out");
const CDI = "X:/CDI READING PROJECT/cdi/tests";
const { url, serviceKey } = loadEnv();
const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
const norm = (s) => s.normalize("NFKC").toLowerCase().replace(/[\u2018\u2019\u2032]/g, "'").replace(/[^a-z0-9]+/g, " ").trim();

const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
const { data: tests } = await supabase.from("tests").select("id, title, kind, file_path").eq("skill", "reading");
const { data: have } = await supabase.from("test_pdfs").select("test_id");
const haveSet = new Set((have ?? []).map((r) => r.test_id));
const titleHits = (m) => tests.filter((t) => norm(t.title) === norm(m.title));
const todo = manifest.filter((m) => (m.passages ?? 1) === 1 && titleHits(m).length !== 1);
const candidates = tests.filter((t) => !haveSet.has(t.id) && t.file_path);
console.log(`${todo.length} PDFs to place; ${candidates.length} site tests without a PDF to search\n`);

const cache = new Map();
async function textOf(t) {
  if (cache.has(t.id)) return cache.get(t.id);
  const { data } = await fileStore("tests", supabase).download(t.file_path);
  let text = "";
  if (data) text = norm((await data.text()).replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "));
  cache.set(t.id, text);
  return text;
}

const map = {};
for (const m of todo) {
  const src = JSON.parse(readFileSync(join(CDI, m.cdiId, "test.json"), "utf8"));
  const first = src.passages[0].blocks.flatMap((b) => (b.kind === "section" ? b.paragraphs : b.kind === "para" ? [b] : [])).find((p) => p.text);
  const needle = norm(first.text).split(" ").slice(0, 14).join(" ");
  const hits = [];
  for (const t of candidates) if ((await textOf(t)).includes(needle)) hits.push(t);
  if (hits.length === 1) {
    map[m.cdiId] = hits[0].id;
    console.log(`MATCH ${m.cdiId}  "${m.title}"  ->  ${hits[0].id}  site title: "${hits[0].title}"`);
  } else {
    console.log(`NONE  ${m.cdiId}  "${m.title}" — ${hits.length === 0 ? "no site test without a PDF contains it" : hits.length + " site tests contain it: " + hits.map((h) => h.title).join(" | ")}`);
  }
}
writeFileSync(out, JSON.stringify(map, null, 1));
console.log(`\n${Object.keys(map).length} matched, written to ${out}`);
