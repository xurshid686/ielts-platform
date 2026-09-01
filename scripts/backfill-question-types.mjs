// Backfills `tests.question_types` for reading tests by reading the rubric
// wording out of each stored CDI file.
//
// 86 of 121 reading tests had NO question types tagged, because only the admin
// upload form's checkboxes ever set them — the premium batch uploader never did.
// That left the catalogue's question-type filter covering under a third of the
// library, and the dashboard's "weakest type" recommendation drawing from the
// same sliver.
//
//   node scripts/backfill-question-types.mjs            # dry run, writes nothing
//   node scripts/backfill-question-types.mjs --apply    # write the empty ones
//   node scripts/backfill-question-types.mjs --apply --force   # also overwrite existing tags
//   node scripts/backfill-question-types.mjs --skill listening # (reading by default)
//
// The classification rules live in src/lib/ielts/infer-question-types.ts and are
// unit-tested, so this script stays a thin driver over them.

import { createClient } from "@supabase/supabase-js";
import { inferQuestionTypes } from "../src/lib/ielts/infer-question-types.ts";
import { loadEnv } from "./env.mjs";

loadEnv();

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const FORCE = args.includes("--force");
const SKILL = (() => {
  const i = args.indexOf("--skill");
  return i >= 0 && args[i + 1] ? args[i + 1] : "reading";
})();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const { data: tests, error } = await db
  .from("tests")
  .select("id, title, skill, tier, question_types, file_path")
  .eq("skill", SKILL)
  .order("title");
if (error) {
  console.error("Query failed:", error.message);
  process.exit(1);
}

const targets = (tests ?? []).filter(
  (t) => FORCE || !t.question_types || t.question_types.length === 0,
);

console.log(
  `\n${SKILL}: ${tests.length} tests, ${targets.length} to classify` +
    `${FORCE ? " (--force: including already-tagged)" : ""}`,
);
console.log(APPLY ? "MODE: APPLY — will write\n" : "MODE: dry run — nothing will be written\n");

const review = [];
const resolved = [];
let failed = 0;

for (const t of targets) {
  const { data: blob, error: dlErr } = await db.storage.from("tests").download(t.file_path);
  if (dlErr || !blob) {
    failed++;
    console.log(`  DOWNLOAD FAILED  ${t.title}  (${dlErr?.message ?? "no blob"})`);
    continue;
  }
  const r = inferQuestionTypes(await blob.text());
  const line = `${r.needsReview ? "REVIEW" : "ok    "}  ${t.title.slice(0, 46).padEnd(48)} ${r.types.join(", ") || "(none found)"}`;
  console.log("  " + line);
  if (r.ambiguous.length) console.log(`          ambiguous: ${r.ambiguous.join("; ")}`);

  (r.needsReview ? review : resolved).push({ id: t.id, title: t.title, types: r.types });

  if (APPLY && r.types.length > 0) {
    const { error: upErr } = await db
      .from("tests")
      .update({ question_types: r.types })
      .eq("id", t.id);
    if (upErr) {
      failed++;
      console.log(`          WRITE FAILED: ${upErr.message}`);
    }
  }
}

console.log(`\nclassified cleanly : ${resolved.length}`);
console.log(`needs human review : ${review.length}`);
if (failed) console.log(`failures           : ${failed}`);
if (review.length) {
  console.log("\nReview these in /admin/tests:");
  for (const r of review) console.log(`  - ${r.title}`);
}
if (!APPLY) console.log("\nRe-run with --apply to write these.\n");
else console.log(`\nWrote ${resolved.length} row(s). Tests with nothing found were left untouched.\n`);

process.exit(failed ? 1 : 0);
