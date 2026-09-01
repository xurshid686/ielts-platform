// Audits which tests can be served SANITIZED.
//
// /api/test-html only strips the answer key from a test that has one stored —
// a keyless test must keep scoring itself in-page, which means it still ships
// its own answers to the browser. Those rows are the remaining hole in the
// paywall, so this lists them.
//
//   node scripts/audit-answer-keys.mjs
//
// Fix anything it reports with:  node scripts/backfill-keys.mjs

import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./env.mjs";

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });

const { data, error } = await db
  .from("tests")
  .select("id, title, skill, kind, tier, answer_key, total")
  .order("skill")
  .order("title");

if (error) {
  console.error("Query failed:", error.message);
  process.exit(1);
}

const rows = data ?? [];
const keyless = rows.filter((t) => {
  const k = t.answer_key;
  return !k || typeof k !== "object" || Object.keys(k).length === 0;
});

const by = (pred) => rows.filter(pred).length;

console.log(`\nTests: ${rows.length}  (reading ${by((t) => t.skill === "reading")}, listening ${by((t) => t.skill === "listening")})`);
console.log(`Premium: ${by((t) => t.tier === "premium")}   Free: ${by((t) => t.tier !== "premium")}`);
console.log(`\nServed SANITIZED (key stored, answers hidden): ${rows.length - keyless.length}`);
console.log(`Served RAW  (no key — still ships its own answers): ${keyless.length}`);

if (keyless.length) {
  console.log("\nThese still leak their answer key to anyone who opens the page:\n");
  for (const t of keyless) {
    console.log(`  ${t.tier === "premium" ? "PREMIUM" : "free   "}  ${t.skill.padEnd(9)}  ${t.title}`);
    console.log(`           ${t.id}`);
  }
  console.log(`\nFix: node scripts/backfill-keys.mjs`);
  process.exit(1);
}

console.log("\nEvery test has a stored key — all of them are served sanitized.\n");
