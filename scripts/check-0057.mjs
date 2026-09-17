// Read-only check for migration 0057 (Writing Task 2 practice).
//
// The thing worth proving is NOT that the tables exist — it is that a browser
// cannot touch them. 0057 enables RLS with no policies and no grants, so an
// ANON key must be refused, exactly as the mock tables are (0050). Verifying a
// schema change with the anon key rather than by loading a page is the rule
// CLAUDE.md sets after 0044/0045.
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./env.mjs";

const { url, serviceKey, anonKey } = loadEnv();
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const anon = createClient(url, anonKey, { auth: { persistSession: false } });

const checks = [];
const say = (ok, label, detail = "") => checks.push({ ok, label, detail });

for (const table of ["writing_practice", "writing_practice_attempts"]) {
  const { error } = await admin.from(table).select("id").limit(1);
  say(!error, `service role reads ${table}`, error?.message ?? "");

  const { error: anonErr } = await anon.from(table).select("id").limit(1);
  say(
    !!anonErr && /permission denied|not exist|schema cache/i.test(anonErr.message),
    `anon is REFUSED on ${table}`,
    anonErr ? anonErr.message : "anon could read it — that is a leak",
  );

  const { error: writeErr } = await anon.from(table).insert({});
  say(!!writeErr, `anon cannot insert into ${table}`, writeErr?.message ?? "the insert succeeded");
}

// The CHECK constraint is what stops a typo becoming a sixteenth topic.
const { error: badTopic } = await admin
  .from("writing_practice")
  .insert({ topic: "not-a-topic", prompt: "x", source_hash: "check-constraint-probe" });
say(
  !!badTopic && /check constraint|violates/i.test(badTopic.message),
  "an unknown topic is refused by the CHECK constraint",
  badTopic?.message ?? "it was accepted",
);

const { count } = await admin.from("writing_practice").select("id", { count: "exact", head: true });
const { count: published } = await admin
  .from("writing_practice")
  .select("id", { count: "exact", head: true })
  .eq("published", true);

let bad = 0;
for (const c of checks) {
  if (!c.ok) bad++;
  console.log(`${c.ok ? "✅" : "❌"}  ${c.label}${c.detail ? `  — ${c.detail}` : ""}`);
}
console.log(`\nquestions: ${count ?? 0} (${published ?? 0} published)`);
process.exitCode = bad ? 1 : 0;
