// Verifies 0074: paying an ULTIMA order extends ultima_members AND premium_until
// by the same months, once; a refund takes both back; premium orders unchanged.
// Everything inside a rolled-back transaction.
import pg from "pg";
import { loadEnv } from "./env.mjs";
loadEnv();
let bad = 0;
const ok = (l) => console.log("✓", l);
const fail = (l) => { console.log("✗", l); bad++; };
const days = (t) => (new Date(t) - Date.now()) / 864e5;

const c = new pg.Client({ host: "aws-0-eu-central-1.pooler.supabase.com", port: 5432,
  user: `postgres.${process.env.NEW_PROJECT_REF}`, password: process.env.NEW_DB_PASS,
  database: "postgres", ssl: { rejectUnauthorized: false } });
await c.connect();
await c.query("begin");
try {
  const u = (await c.query(`select p.id from profiles p
      where p.role <> 'admin' and p.premium_until is null
        and not exists (select 1 from ultima_members m where m.user_id = p.id) limit 1`)).rows[0].id;
  const dflt = (await c.query("insert into payment_orders (user_id, months, amount_tiyin, provider) values ($1,1,2500000,'click') returning plan", [u])).rows[0].plan;
  dflt === "premium" ? ok("old-style insert defaults to plan=premium") : fail(`default plan ${dflt}`);

  const ord = (await c.query("insert into payment_orders (user_id, plan, months, amount_tiyin, provider) values ($1,'ultima',3,12000000,'payme') returning id", [u])).rows[0].id;
  await c.query("select fulfil_payment_order($1, 1)", [ord]);
  const m1 = (await c.query("select ultima_until from ultima_members where user_id=$1", [u])).rows[0]?.ultima_until;
  const p1 = (await c.query("select premium_until from profiles where id=$1", [u])).rows[0].premium_until;
  m1 && days(m1) > 88 && days(m1) < 93 ? ok(`Ultima +3 months (${days(m1).toFixed(1)} d)`) : fail(`ultima ${m1}`);
  days(p1) > 88 && days(p1) < 93 ? ok(`Premium +3 months too (${days(p1).toFixed(1)} d)`) : fail(`premium ${p1}`);
  await c.query("select fulfil_payment_order($1, 2)", [ord]);
  const m2 = (await c.query("select ultima_until from ultima_members where user_id=$1", [u])).rows[0].ultima_until;
  +new Date(m1) === +new Date(m2) ? ok("second fulfil changed nothing") : fail("ultima extended twice");
  const o = (await c.query("select ultima_until_after, premium_until_after from payment_orders where id=$1", [ord])).rows[0];
  o.ultima_until_after && o.premium_until_after ? ok("order records both new end dates") : fail("end dates not recorded");

  await c.query("select refund_payment_order($1, 5, 3)", [ord]);
  const m3 = (await c.query("select ultima_until from ultima_members where user_id=$1", [u])).rows[0].ultima_until;
  const p3 = (await c.query("select premium_until from profiles where id=$1", [u])).rows[0].premium_until;
  days(m3) < 0.01 && days(p3) < 0.01 ? ok("refund took Ultima and Premium back") : fail(`after refund ultima ${days(m3)} premium ${days(p3)}`);

  try { await c.query("savepoint s"); await c.query("insert into payment_orders (user_id, plan, months, amount_tiyin, provider) values ($1,'gold',1,1,'payme')", [u]); fail("plan=gold accepted"); }
  catch { await c.query("rollback to savepoint s"); ok("unknown plan refused"); }
} finally {
  await c.query("rollback");
  await c.end();
}
console.log(bad ? `\n${bad} PROBLEM(S)` : "\n0074 OK");
process.exit(bad ? 1 : 0);
