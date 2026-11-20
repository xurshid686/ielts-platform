// Upload built reading-test PDFs and register them in test_pdfs (migration 0066).
//
//   node scripts/upload-test-pdfs.mjs --dir="X:/CDI READING PROJECT/Ultima pilot"            # DRY RUN
//   node scripts/upload-test-pdfs.mjs --dir="X:/CDI READING PROJECT/Ultima pilot" --apply    # writes
//
// The folder holds <cdiId>.pdf files and a manifest.json ({file, cdiId, title, pages, bytes}).
// Each PDF is matched to the site's reading test by TITLE (normalised). A PDF with no match, or
// with more than one, is reported and skipped — it is never guessed. Dry run is the default and
// touches nothing; --apply uploads to storage (papers/<test_id>.pdf) and upserts the test_pdfs row.
//
// Targets the LIVE database by default (see scripts/env.mjs) and prints the host first.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./env.mjs";
import { fileStore } from "./storage.mjs";

const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const apply = process.argv.includes("--apply");
const dir = arg("dir");
if (!dir) {
  console.error('Usage: node scripts/upload-test-pdfs.mjs --dir="<folder>" [--apply]');
  process.exit(1);
}

const { url, serviceKey } = loadEnv();
const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
const norm = (s) =>
  s.normalize("NFKC").toLowerCase().replace(/[\u2018\u2019\u2032]/g, "'").replace(/[^a-z0-9]+/g, " ").trim();

const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
const { data: tests, error } = await supabase.from("tests").select("id, title").eq("skill", "reading");
if (error) throw new Error(error.message);

console.log(`${apply ? "APPLY" : "DRY RUN"} — ${manifest.length} PDFs, ${tests.length} reading tests on the site\n`);
// FULL tests have generic titles ("Reading Test 1", "Full Reading Test"), so a title match could pair
// a PDF with the wrong paper. They are matched by CONTENT instead: the site test whose stored file
// contains every one of the PDF's passage titles, and only if exactly one does.
const fullSite = (await supabase.from("tests").select("id, title, file_path").eq("skill", "reading").eq("kind", "full")).data ?? [];
const siteTextCache = new Map();
async function siteText(t) {
  if (siteTextCache.has(t.id)) return siteTextCache.get(t.id);
  let text = "";
  if (t.file_path) {
    const { data } = await fileStore("tests", supabase).download(t.file_path);
    if (data) {
      const html = await data.text();
      text = norm(html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "));
    }
  }
  siteTextCache.set(t.id, text);
  return text;
}
async function matchFull(m) {
  const hits = [];
  for (const t of fullSite) {
    const text = await siteText(t);
    if (m.passageTitles.every((pt) => text.includes(norm(pt)))) hits.push(t);
  }
  return hits;
}

let done = 0;
const only = arg("only")?.split(",");
// --map=<file>: {cdiId: testId} from match-pdfs-by-text.mjs, which overrides title matching.
const textMap = arg("map") ? JSON.parse(readFileSync(arg("map"), "utf8")) : {};
for (const m of manifest) {
  if (only && !only.includes(m.cdiId ?? m.siteId)) continue;
  const mapped = m.siteId || textMap[m.cdiId];   // siteId: the manifest already names the site row
  const isFull = (m.passages ?? 1) > 1;
  const hits = mapped ? tests.filter((t) => t.id === mapped) : isFull ? await matchFull(m) : tests.filter((t) => norm(t.title) === norm(m.title));
  if (hits.length !== 1) {
    console.log(`SKIP  ${m.cdiId ?? m.siteId}  "${m.title}" — ${hits.length === 0 ? "no site test with this title" : `${hits.length} site tests share this title`}`);
    continue;
  }
  const test = hits[0];
  console.log(`${apply ? "UP  " : "WOULD"}  ${m.cdiId ?? m.siteId}  "${m.title}"  ->  ${test.id}  (${m.pages} pages, ${(m.bytes / 1024).toFixed(0)} KB)`);
  if (!apply) continue;
  const bytes = readFileSync(join(dir, m.file));
  const up = await fileStore("papers", supabase).upload(`${test.id}.pdf`, bytes, { contentType: "application/pdf", upsert: true });
  if (up.error) { console.log(`      upload FAILED: ${up.error.message}`); continue; }
  // A re-upload changes the bytes, so the cached Telegram file_id would send the OLD file: reset it.
  const { error: e2 } = await supabase.from("test_pdfs").upsert({
    test_id: test.id, r2_key: `papers/${test.id}.pdf`, bytes: bytes.length, pages: m.pages, tg_file_id: null, built_at: new Date().toISOString(),
  });
  if (e2) console.log(`      row FAILED: ${e2.message}`); else done++;
}
console.log(apply ? `\n${done} registered` : "\nDry run only — nothing written. Re-run with --apply.");
