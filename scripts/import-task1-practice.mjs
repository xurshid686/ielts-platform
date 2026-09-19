// Bulk-import Writing Task 1 practice questions (migration 0058) from the
// @CDI_Report pipeline in C:\Users\user\telegram-channel-map (build_t1.py →
// t1_questions.json + t1_clean/*.png: the chart cropped clear of the stamp).
//
//   node scripts/import-task1-practice.mjs --dry-run
//   node scripts/import-task1-practice.mjs                 # all, UNPUBLISHED
//   node scripts/import-task1-practice.mjs --publish       # and publish them
//   node scripts/import-task1-practice.mjs --publish-all   # publish every task 1 already imported
//
// Same identity as the admin form and add-task1-practice.mjs: sha256 of
// "task1\n" + normalised sentence + "\n" + picture bytes. A re-run skips what
// is already there. A sentence that already exists as a Task 1 (e.g. one the
// owner uploaded by hand) is skipped too, so the library never shows the same
// question twice with two different pictures.
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./env.mjs";

const SRC = "C:/Users/user/telegram-channel-map";
const DRY = process.argv.includes("--dry-run");
const PUBLISH = process.argv.includes("--publish");
const PUBLISH_ALL = process.argv.includes("--publish-all");

loadEnv();
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

if (PUBLISH_ALL) {
  const { data, error } = await supabase
    .from("writing_practice")
    .update({ published: true, updated_at: new Date().toISOString() })
    .eq("task", 1)
    .eq("published", false)
    .select("id");
  if (error) throw new Error(error.message);
  console.log(`published ${data.length} task 1 question(s).`);
  process.exit(0);
}

const CHARTS = new Set(["pie", "bar", "line", "table", "map", "process", "mixed"]);
const questions = JSON.parse(readFileSync(join(SRC, "t1_questions.json"), "utf8"));
const normalise = (s) => s.normalize("NFC").replace(/\s+/g, " ").trim();
const loose = (s) =>
  normalise(s).toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

// Existing task 1 rows: by hash and by sentence.
const { data: existing, error: exErr } = await supabase.from("writing_practice").select("source_hash, prompt").eq("task", 1);
if (exErr) throw new Error(exErr.message);
const haveHash = new Set(existing.map((r) => r.source_hash));
const haveSentence = new Set(existing.map((r) => loose(r.prompt)));

let added = 0, skipped = 0, bad = 0;
for (const q of questions) {
  const chart = CHARTS.has(q.chart) ? q.chart : "mixed";
  const prompt = q.sentence.trim();
  const bytes = readFileSync(join(SRC, "t1_clean", q.file));
  const hash = createHash("sha256").update("task1\n").update(normalise(prompt), "utf8").update("\n").update(bytes).digest("hex");
  if (haveHash.has(hash) || haveSentence.has(loose(prompt))) {
    skipped++;
    continue;
  }
  if (bytes.length > 5 * 1024 * 1024) {
    console.log(`too big, skipped: #${q.id}`);
    bad++;
    continue;
  }
  if (DRY) {
    added++;
    continue;
  }
  const path = `task1/${randomUUID()}.png`;
  const { error: upErr } = await supabase.storage.from("writing-practice").upload(path, bytes, { contentType: "image/png", upsert: false });
  if (upErr) {
    console.log(`upload failed #${q.id}: ${upErr.message}`);
    bad++;
    continue;
  }
  const { error } = await supabase.from("writing_practice").insert({
    task: 1,
    topic: null,
    chart,
    image_path: path,
    prompt,
    source_hash: hash,
    appearances: Math.max(1, q.appearances | 0),
    published: PUBLISH,
  });
  if (error) {
    await supabase.storage.from("writing-practice").remove([path]);
    console.log(`insert failed #${q.id}: ${error.message}`);
    bad++;
    continue;
  }
  haveHash.add(hash);
  haveSentence.add(loose(prompt));
  added++;
  if (added % 25 === 0) console.log(`  ${added} added…`);
}
console.log(`${DRY ? "would add" : "added"} ${added}, skipped ${skipped} already present, ${bad} failed.${PUBLISH ? " (published)" : ""}`);
