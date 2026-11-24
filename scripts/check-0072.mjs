// Verifies migration 0072: the ANON key is refused on test_reports, and the
// CHECK constraints fire (inside a rolled-back transaction, nothing left behind).
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import { loadEnv } from "./env.mjs";
loadEnv();
const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
let bad = 0;
const { error: selErr } = await anon.from("test_reports").select("id").limit(1);
console.log("anon select test_reports:", selErr ? `refused (${selErr.code})` : "ALLOWED");
if (!selErr) bad++;
const { error: insErr } = await anon.from("test_reports").insert({
  test_id: "00000000-0000-0000-0000-000000000000", category: "other", message: "hello there",
});
console.log("anon insert test_reports:", insErr ? `refused (${insErr.code})` : "ALLOWED");
if (!insErr) bad++;

const c = new pg.Client({ host: "aws-0-eu-central-1.pooler.supabase.com", port: 5432,
  user: `postgres.${process.env.NEW_PROJECT_REF}`, password: process.env.NEW_DB_PASS,
  database: "postgres", ssl: { rejectUnauthorized: false } });
await c.connect();
const test = (await c.query("select id from tests limit 1")).rows[0].id;
async function expectFail(label, sql, params) {
  await c.query("begin");
  try { await c.query(sql, params); console.log(`${label}: ACCEPTED (bad)`); bad++; }
  catch (e) { console.log(`${label}: refused (${e.code})`); }
  finally { await c.query("rollback"); }
}
const ins = "insert into test_reports (test_id, category, message, question) values ($1, $2, $3, $4)";
await expectFail("bad category", ins, [test, "spam", "a real message", null]);
await expectFail("message too short", ins, [test, "other", "hi", null]);
await expectFail("question too long", ins, [test, "other", "a real message", "x".repeat(21)]);
await c.query("begin");
await c.query(ins, [test, "wrong_answer", "Q14 key says B but the passage says C", "14"]);
console.log("valid row: accepted (rolled back)");
await c.query("rollback");
await c.end();
console.log(bad ? `\n${bad} PROBLEM(S)` : "\n0072 OK");
process.exit(bad ? 1 : 0);
