// Check for migration 0066 (Ultima PDFs).
//
//   node scripts/check-0066.mjs
//
// A browser cannot touch any of the four tables (ANON refused), the service role can, and the
// constraints fire. Uses no real account; it only probes access.
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./env.mjs";

const { url, serviceKey, anonKey } = loadEnv();
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const anon = createClient(url, anonKey, { auth: { persistSession: false } });

const checks = [];
const say = (ok, label, detail = "") => checks.push({ ok, label, detail });

for (const table of ["ultima_members", "test_pdfs", "teacher_bot_links", "teacher_link_codes"]) {
  const { error } = await admin.from(table).select("*").limit(1);
  say(!error, `service role reads ${table}`, error?.message ?? "");
  const { error: e2 } = await anon.from(table).select("*").limit(1);
  say(!!e2 && /permission denied|not exist|schema cache/i.test(e2.message), `anon is REFUSED on ${table}`, e2?.message ?? "anon could read it, a leak");
  const { error: e3 } = await anon.from(table).insert({});
  say(!!e3, `anon cannot insert into ${table}`, e3?.message ?? "the insert succeeded");
}

// Constraints: a PDF key outside papers/ and a malformed link code are refused.
{
  const { error } = await admin.from("test_pdfs").insert({ test_id: "00000000-0000-0000-0000-000000000000", r2_key: "tests/x.pdf", bytes: 1, pages: 1 });
  say(!!error, "test_pdfs refuses a key outside papers/", error?.message ?? "the insert succeeded");
  const { error: e2 } = await admin.from("teacher_link_codes").insert({ code: "short", user_id: "00000000-0000-0000-0000-000000000000", expires_at: new Date().toISOString() });
  say(!!e2, "teacher_link_codes refuses a malformed code", e2?.message ?? "the insert succeeded");
}

let bad = 0;
for (const c of checks) {
  console.log(`${c.ok ? "PASS" : "FAIL"}  ${c.label}${c.ok ? "" : `  -> ${c.detail}`}`);
  if (!c.ok) bad++;
}
console.log(bad ? `\n${bad} check(s) FAILED` : "\nAll checks passed");
process.exit(bad ? 1 : 0);
