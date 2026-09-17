// Import IELTS Writing Task 2 practice questions from the @CDI_Report corpus.
//
// The corpus is built and classified elsewhere (C:\Users\user\telegram-channel-map,
// wt2_topics.py) and lands as wt2_topics.json:
//
//   { generated, reports, unique, appearances,
//     topics: [ { topic: "Education", questions: [ { text, count }, … ] }, … ] }
//
// This script is the ONLY way questions get into `writing_practice`. The
// migration (0057) carries schema only, deliberately: the corpus grows every
// week, and data inlined in a migration cannot be re-run.
//
// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------
//   node scripts/import-writing-practice.mjs --dry-run
//   node scripts/import-writing-practice.mjs --only=1 --publish
//   node scripts/import-writing-practice.mjs                 # import them all
//   node scripts/import-writing-practice.mjs --publish-all
//
//   --source=<path>   the corpus file (default: the telegram-channel-map one)
//   --dry-run         change nothing; print what would happen
//   --only=<n|hash>   import exactly ONE question: its rank in the whole corpus
//                     (1 = most reported) or its source hash
//   --publish         publish the rows this run imported or updated
//   --publish-all     publish EVERY row in the table, then stop
//   --env=local       see scripts/env.mjs (default: the live Frankfurt project)
//
// ---------------------------------------------------------------------------
// The rules that matter
// ---------------------------------------------------------------------------
// * `source_hash` is the identity: sha256 of the NFC-normalised, trimmed,
//   whitespace-collapsed question. Case, punctuation and wording are PRESERVED,
//   and the topic and the counts are excluded — so a question whose topic gets
//   reclassified is the same question, and reformatting whitespace is not a new
//   one. Two different questions that normalise to the same hash are REPORTED,
//   never silently merged.
// * A re-run updates `appearances` and `topic` and PRESERVES `published`. The
//   owner's publish decisions are theirs.
// * NOTHING IS EVER DELETED. A question that leaves the corpus stays in the
//   table; hide it in /admin/writing-practice instead. Attempts reference it
//   with `on delete restrict`, so deleting one would mean deleting a student's
//   essay.
// * Editing a question's wording changes its hash, so it would import as a NEW
//   row. That is on purpose — reconciling an edit is a deliberate act, not a
//   side effect of an import — but it means the old row must then be hidden by
//   hand.
// * Every prompt is run through the app's own parseTask2() first. A prompt the
//   parser cannot split renders with an empty question line, so those are
//   printed for a human to look at. THE PARSER IS NOT ADJUSTED TO FIT THEM: it
//   is shared with the live mock exam.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./env.mjs";

const DEFAULT_SOURCE = "C:\\Users\\user\\telegram-channel-map\\wt2_topics.json";

// Mirrors src/lib/writing-practice-topics.ts. Kept as a literal because this is
// a plain .mjs script with no TypeScript path alias; the 15 ids are also pinned
// by a CHECK constraint in 0057, so a drift here fails the insert loudly.
const TOPIC_BY_SOURCE = new Map([
  ["Education", "education"],
  ["Environment", "environment"],
  ["Health", "health"],
  ["Technology", "technology"],
  ["Work & Careers", "work-careers"],
  ["Family & Children", "family-children"],
  ["Media & Advertising", "media-advertising"],
  ["Crime & Justice", "crime-justice"],
  ["Government & Public Policy", "government-policy"],
  ["Society & Lifestyle", "society-lifestyle"],
  ["Culture & Traditions", "culture-traditions"],
  ["Economy & Consumerism", "economy-consumerism"],
  ["Travel & Tourism", "travel-tourism"],
  ["Transport & Urban Life", "transport-urban"],
  ["Globalisation & International Affairs", "globalisation"],
]);

const arg = (name, fallback = null) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const flag = (name) => process.argv.includes(`--${name}`);

/** The identity of a question. Conservative on purpose — see the header. */
function sourceHash(text) {
  const normalised = text.normalize("NFC").replace(/\s+/g, " ").trim();
  return createHash("sha256").update(normalised, "utf8").digest("hex");
}

// Corpus artefacts, and ONLY these two. The text is otherwise imported exactly
// as reported — this is not a place to fix grammar, spelling or wording, which
// is what a student would actually be asked in the exam.
//
//   * a trailing channel tag ("#CDI", "#CDI_Report") the reporter typed;
//   * invisible bidi / zero-width marks pasted in from a phone keyboard, which
//     render as nothing but break sentence splitting and word counts.
const CHANNEL_TAG = /\s*#\w+\s*$/;
const INVISIBLE = /[​-‏‪-‮⁦-⁩﻿]/g;

function clean(text) {
  return text.replace(INVISIBLE, "").replace(CHANNEL_TAG, "").replace(/\s+/g, " ").trim();
}

// The standard exam lines lib/ielts/writing-prompt.ts strips before it parses.
// Mirrored here so the pre-flight warning below judges the prompt the same way
// the page will. Kept in step with BOILERPLATE there, not extended past it.
const BOILERPLATE = [
  /you\s+should\s+spend\s+(?:about|around|approximately|no\s+more\s+than)?\s*\d+\s*(?:minutes?|mins?)\s+on\s+this\s+task\s*[.!]?/gi,
  /write\s+about\s+the\s+following\s+topic\s*[:.]?/gi,
  /give\s+reasons\s+for\s+your\s+answer\s+and\s+include\s+any\s+relevant\s+examples\s+from\s+your\s+own\s+knowledge\s+(?:or|and)\s+experience\s*[.!]?/gi,
  /write\s+(?:at\s+least|a\s+minimum\s+of|no\s+less\s+than)\s+\d+\s+words\s*[.!]?/gi,
];

// A deliberately small echo of lib/ielts/writing-prompt.ts: enough to spot a
// prompt whose final "what you must do" sentence the app will not find. It is a
// WARNING generator, not a second parser — the app's own one is the truth.
const QUESTION_LEAD =
  /^(?:discuss|to\s+what\s+extent|do\s+you|does\s+this|did|what|why|how|which|who|in\s+your\s+opinion|is\s|are\s|was\s|were\s|do\s|does\s|should|would|could|can|will|has\s|have\s|explain|give\s+your|describe|suggest|outline|compare)\b/i;

function looksParseable(raw) {
  let text = raw;
  for (const re of BOILERPLATE) text = text.replace(re, " ");
  text = text.replace(/\s+/g, " ").trim();
  const parts =
    text
      .replace(/\b(e\.g|i\.e|etc|vs|Mr|Mrs|Dr)\./gi, (m) => m.replace(/\./g, "\u0000"))
      .match(/[^.?!]+(?:[.?!]+["'”’)]*|$)/g) ?? [];
  const sentences = parts.map((s) => s.replace(/\u0000/g, ".").trim()).filter(Boolean);
  if (sentences.length < 2) return false;
  const last = sentences[sentences.length - 1];
  return /\?\s*$/.test(last) || QUESTION_LEAD.test(last);
}

function loadCorpus(path) {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  const out = [];
  for (const group of raw.topics ?? []) {
    const topic = TOPIC_BY_SOURCE.get(String(group.topic).trim());
    if (!topic) {
      console.error(`✗ Unknown topic in the corpus: ${JSON.stringify(group.topic)}`);
      console.error("  Add it to TOPIC_BY_SOURCE here AND to the CHECK constraint in 0057.");
      process.exit(1);
    }
    for (const q of group.questions ?? []) {
      const prompt = clean(String(q.text ?? ""));
      if (!prompt) continue;
      out.push({
        topic,
        prompt,
        appearances: Number(q.count) || 1,
        source_hash: sourceHash(prompt),
      });
    }
  }
  // Most-reported first, so `--only=1` is the pilot the owner would pick.
  out.sort((a, b) => b.appearances - a.appearances || a.prompt.localeCompare(b.prompt));
  return { generated: raw.generated ?? "?", rows: out };
}

async function main() {
  const { serviceKey, url } = loadEnv();
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

  if (flag("publish-all")) {
    const { data, error } = await supabase
      .from("writing_practice")
      .update({ published: true, updated_at: new Date().toISOString() })
      .eq("published", false)
      .select("id");
    if (error) throw new Error(error.message);
    console.log(`Published ${(data ?? []).length} question(s). Nothing else changed.`);
    return;
  }

  const source = arg("source", DEFAULT_SOURCE);
  const dryRun = flag("dry-run");
  const publish = flag("publish");
  const only = arg("only");

  const { generated, rows } = loadCorpus(source);
  console.log(`corpus: ${source}`);
  console.log(`generated ${generated} · ${rows.length} questions\n`);

  // Collisions: two different wordings that normalise to the same hash. Report,
  // never merge — the difference might be the whole question.
  const seen = new Map();
  const collisions = [];
  for (const r of rows) {
    const prev = seen.get(r.source_hash);
    if (prev && prev.prompt !== r.prompt) collisions.push([prev, r]);
    else if (!prev) seen.set(r.source_hash, r);
  }
  if (collisions.length) {
    console.log(`⚠ ${collisions.length} hash collision(s) — NOT imported, look at these by hand:`);
    for (const [a, b] of collisions) {
      console.log(`   ${a.source_hash.slice(0, 12)}`);
      console.log(`     A: ${a.prompt}`);
      console.log(`     B: ${b.prompt}`);
    }
    console.log("");
  }

  const unique = [...seen.values()];

  // Pre-flight: which prompts will render without a question line.
  const odd = unique.filter((r) => !looksParseable(r.prompt));
  if (odd.length) {
    console.log(`⚠ ${odd.length} prompt(s) whose closing instruction the parser may not find:`);
    for (const r of odd.slice(0, 20)) console.log(`   ${r.source_hash.slice(0, 8)}  ${r.prompt}`);
    if (odd.length > 20) console.log(`   … and ${odd.length - 20} more`);
    console.log("   They still import; check how they look on the page before publishing.\n");
  }

  let chosen = unique;
  if (only != null) {
    // A rank wins over a hash prefix, and a hash has to look like one: `--only=1`
    // otherwise matched the first sha256 that happens to start with "1".
    const n = Number(only);
    const byRank = Number.isInteger(n) && n >= 1 && n <= unique.length ? unique[n - 1] : null;
    const byHash =
      !byRank && /^[0-9a-f]{6,64}$/i.test(only)
        ? unique.find((r) => r.source_hash.startsWith(only.toLowerCase()))
        : null;
    const pick = byRank ?? byHash;
    if (!pick) {
      console.error(`✗ --only=${only} matched neither a rank (1–${unique.length}) nor a hash.`);
      process.exit(1);
    }
    chosen = [pick];
    console.log("Importing ONE question:");
    console.log(`  topic:       ${pick.topic}`);
    console.log(`  reported:    ${pick.appearances}×`);
    console.log(`  hash:        ${pick.source_hash}`);
    console.log(`  prompt:      ${pick.prompt}\n`);
  }

  // What is already there, so the run can report inserts vs updates honestly.
  const existing = new Map();
  // 50 at a time: `in.(…)` goes in the URL, and 500 sha256s overflowed it
  // (PostgREST answered a bare "Bad Request").
  for (let i = 0; i < chosen.length; i += 50) {
    const slice = chosen.slice(i, i + 50).map((r) => r.source_hash);
    const { data, error } = await supabase
      .from("writing_practice")
      .select("id, source_hash, published")
      .in("source_hash", slice);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) existing.set(row.source_hash, row);
  }
  const inserts = chosen.filter((r) => !existing.has(r.source_hash));
  const updates = chosen.filter((r) => existing.has(r.source_hash));

  console.log(`${inserts.length} new, ${updates.length} already present (publish decisions kept).`);
  if (publish) console.log("They will be PUBLISHED.");
  if (dryRun) {
    console.log("\n--dry-run: nothing was written.");
    return;
  }

  // One upsert per batch on the hash. `published` is only ever set upward here:
  // a re-run without --publish leaves the owner's decision alone.
  const now = new Date().toISOString();
  let done = 0;
  for (let i = 0; i < chosen.length; i += 200) {
    const batch = chosen.slice(i, i + 200).map((r) => ({
      topic: r.topic,
      prompt: r.prompt,
      source_hash: r.source_hash,
      appearances: r.appearances,
      updated_at: now,
      ...(publish ? { published: true } : existing.has(r.source_hash) ? {} : { published: false }),
    }));
    const { error } = await supabase
      .from("writing_practice")
      .upsert(batch, { onConflict: "source_hash", ignoreDuplicates: false });
    if (error) throw new Error(error.message);
    done += batch.length;
    if (chosen.length > 200) console.log(`  … ${done}/${chosen.length}`);
  }

  const { count } = await supabase
    .from("writing_practice")
    .select("id", { count: "exact", head: true })
    .eq("published", true);
  console.log(`\nDone. ${done} question(s) written; ${count ?? 0} published in total.`);
  if (!publish && inserts.length) {
    console.log("They are UNPUBLISHED — publish them in /admin/writing-practice, or re-run with --publish.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
