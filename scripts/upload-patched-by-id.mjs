// Replaces the stored HTML for existing tests rows from local <test-id>.html files.
// Keeps the row id (so /practice links, saved results and answer keys are untouched); uploads a new
// storage object, repoints the row, removes the old object.
//
//   node scripts/upload-patched-by-id.mjs <dir-with-id-named-html> [ids-file]
//
// Used for the 2026-07-30 contrast repair, where the fix has to be computed per file from its own
// measured colours -- so the patched bytes are produced locally and pushed here, rather than
// re-running an uploader that would delete and re-insert rows under new ids.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const dir = process.argv[2];
const idsFile = process.argv[3];
if (!dir) { console.error("usage: upload-patched-by-id.mjs <dir> [ids-file]"); process.exit(1); }

const wanted = idsFile
  ? readFileSync(idsFile, "utf8").split(/\r?\n/).filter(Boolean).map((x) => x.replace(/\.html$/, ""))
  : readdirSync(dir).filter((f) => /^[0-9a-f-]{36}\.html$/i.test(f)).map((f) => f.replace(/\.html$/, ""));

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } });

let ok = 0, bad = 0;
for (const id of wanted) {
  const { data: row, error: selErr } = await supabase
    .from("tests").select("id,title,skill,file_path").eq("id", id).single();
  if (selErr || !row) { console.log(`  ERR   ${id} — row not found`); bad++; continue; }
  let buf;
  try { buf = readFileSync(join(dir, `${id}.html`)); }
  catch { console.log(`  ERR   ${id} — no local file`); bad++; continue; }

  const newPath = `${row.skill}/patched-${randomUUID()}.html`;
  const { error: up } = await supabase.storage.from("tests")
    .upload(newPath, buf, { contentType: "text/html", upsert: false });
  if (up) { console.log(`  ERR   ${row.title} — upload: ${up.message}`); bad++; continue; }
  const { data: pub } = supabase.storage.from("tests").getPublicUrl(newPath);
  const { error: updErr } = await supabase.from("tests")
    .update({ file_path: newPath, file_url: pub.publicUrl }).eq("id", id);
  if (updErr) {
    await supabase.storage.from("tests").remove([newPath]);
    console.log(`  ERR   ${row.title} — update: ${updErr.message}`); bad++; continue;
  }
  if (row.file_path && row.file_path !== newPath) {
    await supabase.storage.from("tests").remove([row.file_path]);
  }
  console.log(`  OK    ${row.title.slice(0, 50)}`);
  ok++;
}
console.log(`\nupdated ${ok}, failed ${bad}`);
