// Export, for every test_pdfs row, the plain text of the site test's stored file, for an offline
// check that the PDF's questions are the site test's questions (scripts/../audit in the skill).
//   node scripts/export-pdf-audit.mjs --out=audit.json
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./env.mjs";
import { fileStore } from "./storage.mjs";
const out = process.argv.find((a) => a.startsWith("--out="))?.slice(6);
const { url, serviceKey } = loadEnv();
const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
const { data: rows } = await supabase.from("test_pdfs").select("test_id, bytes, pages");
const result = [];
for (const r of rows) {
  const { data: t } = await supabase.from("tests").select("title, file_path").eq("id", r.test_id).single();
  let text = "";
  if (t?.file_path) {
    const { data } = await fileStore("tests", supabase).download(t.file_path);
    if (data) text = (await data.text()).replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
  }
  result.push({ test_id: r.test_id, title: t?.title, bytes: r.bytes, pages: r.pages, text });
}
writeFileSync(out, JSON.stringify(result));
console.log(`exported ${result.length} rows`);
