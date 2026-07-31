// Repairs the question-number contrast defect in the HTML the SITE ACTUALLY SERVES.
//
// Why not re-upload from X:\CDI READING PROJECT: matching a live row's title back to an archive
// filename is guesswork (the archive keeps "<title> Passage N by <agent>.html" while the row stores
// just the title), and upload-public-test.mjs / upload-premium-batch.mjs delete + re-insert rows,
// minting new ids and breaking any shared /practice link. So this downloads the stored object,
// injects the fix, uploads a new object and repoints the SAME row. ids, answer_key, tier and
// is_public are never touched.
//
// Usage:
//   node scripts/patch-live-contrast.mjs            # report what would change
//   node scripts/patch-live-contrast.mjs --apply    # do it (originals saved to --backup dir)
//   node scripts/patch-live-contrast.mjs --apply --footer   # inject the FOOTER variant instead
//
// The footer variant is for older builds whose active footer pill stays pale #ffffca while
// -webkit-text-fill-color is #fff. It must ONLY be applied to files measured as failing: on a
// canonical shell (dark active pill, white text) forcing black text would create the same bug.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const APPLY = process.argv.includes("--apply");
const FOOTER = process.argv.includes("--footer");
const ONLY = (() => { const i = process.argv.indexOf("--only"); return i > 0 ? process.argv[i + 1] : null; })();

const MARKER = "CDI-CONTRAST-FIX: current-question number legibility";
const FOOTER_MARKER = "CDI-CONTRAST-FIX-FOOTER: active footer number legibility";

const BLOCK = `
/* ===== ${MARKER} =====
   The legacy current-question highlight sets color:#000 per theme at specificity (0,4,3); the
   live-parity block that removes its pale background selects at (0,3,2) and never sets a colour,
   so in both contrast themes the current number was a black glyph on a black page (ratio 1.00).
   Sets background AND colour together, per theme, last in the cascade. Default theme untouched. */
html body.theme-dark .q-current :is(.q-num-box, .qn, .tfng-number, .mcq-q-num-box),
html body.theme-dark :is(.q-num-box, .qn, .tfng-number, .mcq-q-num-box).q-current,
html body.theme-dark .matching-table tr.q-current .q-num-box,
html body.theme-dark .summary-line.q-current .qn,
html body.theme-dark .notes-item.q-current .qn,
html body.theme-dark .tfng-question.q-current .tfng-number {
  background: transparent !important;
  color: #f9fafb !important;
  -webkit-text-fill-color: #f9fafb !important;
}
html body.theme-yellow .q-current :is(.q-num-box, .qn, .tfng-number, .mcq-q-num-box),
html body.theme-yellow :is(.q-num-box, .qn, .tfng-number, .mcq-q-num-box).q-current,
html body.theme-yellow .matching-table tr.q-current .q-num-box,
html body.theme-yellow .summary-line.q-current .qn,
html body.theme-yellow .notes-item.q-current .qn,
html body.theme-yellow .tfng-question.q-current .tfng-number {
  background: transparent !important;
  color: #fde047 !important;
  -webkit-text-fill-color: #fde047 !important;
}
`;

const FOOTER_BLOCK = `
/* ===== ${FOOTER_MARKER} =====
   theme-dark set -webkit-text-fill-color:#fff on the active footer number while its background
   stayed the pale #ffffca pill and its own colour asked for black — the fill wins, so the current
   question's number was white on pale yellow (1.03:1). Match the fill to the intended colour. */
html body.theme-dark .subQuestion.active,
html body.theme-dark .footer__subquestionWrapper .subQuestion.active {
  color: #000 !important;
  -webkit-text-fill-color: #000 !important;
}
`;

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } });

const backupDir = join("..", "codex in vs code", ".orchestra", "backups",
  `live-contrast-${new Date().toISOString().slice(0, 10)}`);
if (APPLY) mkdirSync(backupDir, { recursive: true });

const { data: rows, error } = await supabase
  .from("tests").select("id,title,skill,tier,is_public,file_path").order("title");
if (error) { console.error(error.message); process.exit(1); }

const marker = FOOTER ? FOOTER_MARKER : MARKER;
const block = FOOTER ? FOOTER_BLOCK : BLOCK;
let changed = 0, skipped = 0, failed = 0;

for (const t of rows) {
  if (ONLY && t.id !== ONLY) continue;
  if (!t.file_path) { skipped++; continue; }
  const { data: blob, error: dl } = await supabase.storage.from("tests").download(t.file_path);
  if (dl || !blob) { console.log(`  ERR   ${t.title} — cannot download`); failed++; continue; }
  const txt = await blob.text();
  const label = `${t.tier}/${t.skill} ${t.title}`.slice(0, 56).padEnd(58);

  if (txt.includes(marker)) { skipped++; continue; }
  // Only files carrying the rules the fix targets can be affected.
  const relevant = FOOTER ? txt.includes(".subQuestion")
                          : (txt.includes(".q-current .q-num-box") || txt.includes(".q-current .qn"));
  if (!relevant) { skipped++; continue; }
  const idx = txt.lastIndexOf("</style>");
  if (idx < 0) { console.log(`  ERR   ${label} no </style>`); failed++; continue; }

  if (!APPLY) { console.log(`  WOULD ${label}`); changed++; continue; }

  writeFileSync(join(backupDir, `${t.id}.html`), txt, "utf8");
  const out = txt.slice(0, idx) + block + txt.slice(idx);
  const newPath = `${t.skill}/patched-${randomUUID()}.html`;
  const { error: up } = await supabase.storage.from("tests")
    .upload(newPath, Buffer.from(out, "utf8"), { contentType: "text/html", upsert: false });
  if (up) { console.log(`  ERR   ${label} upload: ${up.message}`); failed++; continue; }
  const { data: pub } = supabase.storage.from("tests").getPublicUrl(newPath);
  const { error: updErr } = await supabase.from("tests")
    .update({ file_path: newPath, file_url: pub.publicUrl }).eq("id", t.id);
  if (updErr) {
    await supabase.storage.from("tests").remove([newPath]);
    console.log(`  ERR   ${label} update: ${updErr.message}`); failed++; continue;
  }
  await supabase.storage.from("tests").remove([t.file_path]);
  console.log(`  FIXED ${label}`);
  changed++;
}
console.log(`\n${APPLY ? "patched" : "would patch"}: ${changed}   skipped: ${skipped}   failed: ${failed}`);
if (APPLY && changed) console.log(`originals backed up to ${backupDir}`);
