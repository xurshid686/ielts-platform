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
let done = 0;
for (const m of manifest) {
  const hits = tests.filter((t) => norm(t.title) === norm(m.title));
  if (hits.length !== 1) {
    console.log(`SKIP  ${m.cdiId}  "${m.title}" — ${hits.length === 0 ? "no site test with this title" : `${hits.length} site tests share this title`}`);
    continue;
  }
  const test = hits[0];
  console.log(`${apply ? "UP  " : "WOULD"}  ${m.cdiId}  "${m.title}"  ->  ${test.id}  (${m.pages} pages, ${(m.bytes / 1024).toFixed(0)} KB)`);
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
