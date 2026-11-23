// Verifies migration 0069 the way that matters: the ANON key is refused on both
// tables and the RPC, and the RPC works for the service role (inside a rolled
// back transaction, so nothing is left behind).
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import { loadEnv } from "./env.mjs";
loadEnv();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
let bad = 0;
for (const t of ["premium_passes", "premium_trials"]) {
  const { error } = await anon.from(t).select("*").limit(1);
  console.log(`anon select ${t}:`, error ? `refused (${error.code})` : "ALLOWED");
  if (!error) bad++;
}
const { error: rpcErr } = await anon.rpc("claim_premium_pass", {
  p_user: "00000000-0000-0000-0000-000000000000", p_test: "00000000-0000-0000-0000-000000000000", p_limit: 3,
});
console.log("anon rpc claim_premium_pass:", rpcErr ? `refused (${rpcErr.code})` : "ALLOWED");
if (!rpcErr) bad++;

const c = new pg.Client({ host: "aws-0-eu-central-1.pooler.supabase.com", port: 5432,
  user: `postgres.${process.env.NEW_PROJECT_REF}`, password: process.env.NEW_DB_PASS,
  database: "postgres", ssl: { rejectUnauthorized: false } });
await c.connect();
await c.query("begin");
const u = (await c.query("select id from profiles where role <> 'admin' limit 1")).rows[0].id;
const prem = (await c.query("select id from tests where tier='premium' and coalesce(track,'regular')='regular' order by created_at limit 4")).rows.map(r => r.id);
const free = (await c.query("select id from tests where tier='free' limit 1")).rows[0].id;
const out = [];
for (const t of prem) out.push((await c.query("select claim_premium_pass($1,$2,3) r", [u, t])).rows[0].r);
out.push((await c.query("select claim_premium_pass($1,$2,3) r", [u, prem[0]])).rows[0].r);
out.push((await c.query("select claim_premium_pass($1,$2,3) r", [u, free])).rows[0].r);
await c.query("rollback");
await c.end();
const want = ["ok", "ok", "ok", "limit", "already", "not_premium"];
console.log("rpc sequence:", out.join(", "), JSON.stringify(out) === JSON.stringify(want) ? "✓" : `✗ want ${want}`);
if (JSON.stringify(out) !== JSON.stringify(want)) bad++;
process.exit(bad ? 1 : 0);
