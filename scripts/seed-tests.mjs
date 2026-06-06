// Uploads staged seed tests to Supabase Storage + inserts `tests` rows.
// Requires the SERVICE ROLE key (bypasses RLS). Run AFTER the migration.
//
//   1) Add to .env.local:  SUPABASE_SERVICE_ROLE_KEY=...   (secret, never commit)
//   2) node scripts/prepare-seed.mjs   (stages the files)
//   3) node scripts/seed-tests.mjs     (this script)
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

// minimal .env.local loader
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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
const manifest = JSON.parse(readFileSync(join(root, "seed", "manifest.json"), "utf8"));

let ok = 0;
for (const t of manifest) {
  const buf = readFileSync(join(root, t.path));
  const storagePath = `${t.skill}/seed-${t.slug}.html`;

  const { error: upErr } = await supabase.storage
    .from("tests")
    .upload(storagePath, buf, { contentType: "text/html", upsert: true });
  if (upErr) {
    console.error(`Upload failed (${t.title}): ${upErr.message}`);
    continue;
  }

  const { data: pub } = supabase.storage.from("tests").getPublicUrl(storagePath);

  // Avoid duplicates on re-run: delete any existing row with the same title+skill.
  await supabase.from("tests").delete().eq("title", t.title).eq("skill", t.skill);

  const { error: insErr } = await supabase.from("tests").insert({
    title: t.title,
    skill: t.skill,
    level: t.level,
    file_url: pub.publicUrl,
    file_path: storagePath,
  });
  if (insErr) {
    console.error(`Insert failed (${t.title}): ${insErr.message}`);
    continue;
  }
  console.log(`Seeded: ${t.title}  (${t.skill})`);
  ok++;
}

console.log(`\nDone. ${ok}/${manifest.length} tests are now live.`);
