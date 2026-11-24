// Verifies migration 0073 the way that matters: the ANON key is refused on
// payment_orders and both functions; fulfil is idempotent (two calls extend
// once) and a refund takes the months back. All inside rolled-back transactions.
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import { loadEnv } from "./env.mjs";
loadEnv();
const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
let bad = 0;
const fail = (l) => { console.log("✗", l); bad++; };
const ok = (l) => console.log("✓", l);

const { error: selErr } = await anon.from("payment_orders").select("id").limit(1);
selErr ? ok(`anon select refused (${selErr.code})`) : fail("anon select ALLOWED");
const { error: insErr } = await anon.from("payment_orders").insert({ months: 1, amount_tiyin: 1, provider: "payme" });
insErr ? ok(`anon insert refused (${insErr.code})`) : fail("anon insert ALLOWED");
for (const [fn, args] of [
  ["fulfil_payment_order", { p_order: "00000000-0000-0000-0000-000000000000" }],
  ["refund_payment_order", { p_order: "00000000-0000-0000-0000-000000000000", p_reason: 1, p_cancel_time: 1 }],
]) {
  const { error } = await anon.rpc(fn, args);
  error ? ok(`anon rpc ${fn} refused (${error.code})`) : fail(`anon rpc ${fn} ALLOWED`);
}

const c = new pg.Client({ host: "aws-0-eu-central-1.pooler.supabase.com", port: 5432,
  user: `postgres.${process.env.NEW_PROJECT_REF}`, password: process.env.NEW_DB_PASS,
  database: "postgres", ssl: { rejectUnauthorized: false } });
await c.connect();
await c.query("begin");
try {
  // a student with NO premium
  const u = (await c.query("select id from profiles where role <> 'admin' and premium_until is null limit 1")).rows[0].id;
  const ord = (await c.query(
    "insert into payment_orders (user_id, months, amount_tiyin, provider) values ($1, 3, 6000000, 'payme') returning id", [u],
  )).rows[0].id;
  await c.query("select fulfil_payment_order($1, 123)", [ord]);
  const p1 = (await c.query("select premium_until, premium_announce from profiles where id = $1", [u])).rows[0];
  await c.query("select fulfil_payment_order($1, 456)", [ord]);  // retry
  const p2 = (await c.query("select premium_until from profiles where id = $1", [u])).rows[0];
  const days = (new Date(p1.premium_until) - Date.now()) / 864e5;
  days > 88 && days < 93 ? ok(`fulfil extended ~3 months (${days.toFixed(1)} days)`) : fail(`fulfil extended ${days} days`);
  p1.premium_announce ? ok("premium_announce set") : fail("premium_announce not set");
  +new Date(p1.premium_until) === +new Date(p2.premium_until) ? ok("second fulfil changed nothing (idempotent)") : fail("second fulfil extended again");
  const o = (await c.query("select status, payme_state, perform_time from payment_orders where id = $1", [ord])).rows[0];
  o.status === "paid" && o.payme_state === 2 && o.perform_time === "123" ? ok("order paid, state 2, first perform_time kept") : fail(`order ${JSON.stringify(o)}`);

  await c.query("select refund_payment_order($1, 5, 789)", [ord]);
  const p3 = (await c.query("select premium_until from profiles where id = $1", [u])).rows[0];
  const left = (new Date(p3.premium_until) - Date.now()) / 864e5;
  left < 0.01 ? ok("refund took the 3 months back (expiry ~now)") : fail(`refund left ${left} days`);
  const o2 = (await c.query("select status, payme_state, cancel_reason from payment_orders where id = $1", [ord])).rows[0];
  o2.status === "cancelled" && o2.payme_state === -2 && o2.cancel_reason === 5 ? ok("order cancelled, state -2") : fail(`after refund ${JSON.stringify(o2)}`);
  try { await c.query("savepoint s"); await c.query("select fulfil_payment_order($1)", [ord]); fail("fulfil of a cancelled order allowed"); }
  catch { await c.query("rollback to savepoint s"); ok("fulfil of a cancelled order refused"); }

  // bad CHECKs
  try { await c.query("savepoint t"); await c.query("insert into payment_orders (months, amount_tiyin, provider) values (2, 1, 'payme')"); fail("months=2 accepted"); }
  catch { await c.query("rollback to savepoint t"); ok("months=2 refused"); }
} finally {
  await c.query("rollback");
  await c.end();
}
console.log(bad ? `\n${bad} PROBLEM(S)` : "\n0073 OK");
process.exit(bad ? 1 : 0);
