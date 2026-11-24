// Verify migration 0075 (profile guard + payment hardening) against the chosen DB.
//
//   node scripts/check-0075.mjs            # live (.env.frankfurt)
//
// Everything runs inside ONE transaction that is ROLLED BACK, so no profile,
// order or auth user is changed. Student writes are played as the real
// `authenticated` role with a JWT claim, which is exactly what PostgREST does,
// so RLS and the guard trigger both apply.
import pg from "pg";
import { loadEnv } from "./env.mjs";

loadEnv();
let failures = 0;
const ok = (m) => console.log("  ✅", m);
const fail = (m) => { failures++; console.log("  ❌", m); };

const c = new pg.Client({ host: "aws-0-eu-central-1.pooler.supabase.com", port: 5432,
  user: `postgres.${process.env.NEW_PROJECT_REF}`, password: process.env.NEW_DB_PASS,
  database: "postgres", ssl: { rejectUnauthorized: false } });
await c.connect();
await c.query("begin");

let sp = 0;
/** Run sql as the student; expect it to succeed (true) or be refused (false). */
async function asStudent(uid, label, sql, params, expectOk) {
  const name = `s${++sp}`;
  await c.query(`savepoint ${name}`);
  try {
    await c.query("set local role authenticated");
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: "authenticated" })]);
    const r = await c.query(sql, params);
    await c.query("reset role");
    if (expectOk) r.rowCount === 1 ? ok(label) : fail(`${label} (updated ${r.rowCount} rows)`);
    else fail(`${label} — ALLOWED`);
    await c.query(`release savepoint ${name}`);
  } catch (e) {
    await c.query(`rollback to savepoint ${name}`);
    await c.query("reset role");
    expectOk ? fail(`${label} — refused: ${e.message}`) : ok(`${label} (refused: ${e.message})`);
  }
}

try {
  const u = (await c.query("select id, email from profiles where role <> 'admin' and not is_owner limit 1")).rows[0];
  const other = (await c.query("select email from profiles where id <> $1 limit 1", [u.id])).rows[0].email;
  console.log("student guard");
  const upd = (set) => `update public.profiles set ${set} where id = '${u.id}'`;
  await asStudent(u.id, "student cannot take another account's email", upd("email = $1"), [other], false);
  await asStudent(u.id, "student cannot change their own email", upd("email = $1"), ["new-" + u.email], false);
  await asStudent(u.id, "avatar to a foreign URL refused", upd("avatar_url = $1"), ["https://evil.example/p.png"], false);
  await asStudent(u.id, "avatar to someone else's /api/avatar refused", upd("avatar_url = $1"), ["/api/avatar/00000000-0000-0000-0000-000000000000"], false);
  await asStudent(u.id, "avatar to own /api/avatar allowed", upd("avatar_url = $1"), [`/api/avatar/${u.id}?v=test`], true);
  await asStudent(u.id, "avatar removal allowed", upd("avatar_url = null"), [], true);
  await asStudent(u.id, "fake time zone refused", upd("timezone = $1"), ["Fake/Zone"], false);
  await asStudent(u.id, "real time zone allowed", upd("timezone = $1"), ["Asia/Tashkent"], true);
  await asStudent(u.id, "name with a newline refused", upd("name = $1"), ["Ali\nValiyev"], false);
  await asStudent(u.id, "81-char name refused", upd("name = $1"), ["x".repeat(81)], false);
  await asStudent(u.id, "normal name allowed", upd("name = $1"), ["Ali Valiyev"], true);
  await asStudent(u.id, "premium_announce on refused", upd("premium_announce = true"), [], false);
  await asStudent(u.id, "premium_announce off allowed", upd("premium_announce = false"), [], true);
  await asStudent(u.id, "target_band allowed", upd("target_band = 7"), [], true);
  await asStudent(u.id, "premium_until still refused", upd("premium_until = now() + interval '1 year'"), [], false);

  console.log("email sync + uniqueness");
  await c.query("savepoint e1");
  await c.query("update auth.users set email = $1 where id = $2", ["sync-check-0075@example.invalid", u.id]);
  const synced = (await c.query("select email from profiles where id = $1", [u.id])).rows[0].email;
  synced === "sync-check-0075@example.invalid" ? ok("auth email change follows into profiles") : fail(`profile email ${synced}`);
  await c.query("rollback to savepoint e1");
  try {
    await c.query("savepoint e2");
    await c.query("update profiles set email = upper($1) where id = $2", [other, u.id]);
    fail("duplicate email (case-insensitive) accepted");
  } catch (e) { await c.query("rollback to savepoint e2"); ok(`duplicate email refused (${e.code})`); }

  console.log("payments");
  const ord = (await c.query("insert into payment_orders (user_id, months, amount_tiyin, provider) values ($1, 1, 2500000, 'click') returning id", [u.id])).rows[0].id;
  try {
    await c.query("savepoint p1");
    await c.query("select fulfil_payment_order($1)", [ord]);
    fail("fulfil of a CREATED order allowed");
  } catch (e) { await c.query("rollback to savepoint p1"); ok(`fulfil of a created order refused (${e.message})`); }
  await c.query("update payment_orders set status = 'pending', provider_tx_id = 'check-0075' where id = $1", [ord]);
  const paid = (await c.query("select (fulfil_payment_order($1)).status", [ord])).rows[0].status;
  paid === "paid" ? ok("fulfil of a pending order pays") : fail(`status ${paid}`);

  console.log("grants");
  for (const fn of ["set_user_role(text,text)", "set_premium(text,integer)", "gift_xp(text,integer)",
                    "set_leaderboard_hidden(text,boolean)", "admin_send_weekly_report(uuid,date)"]) {
    const r = (await c.query(`select has_function_privilege('anon', 'public.${fn}', 'execute') a,
                                     has_function_privilege('authenticated', 'public.${fn}', 'execute') s`)).rows[0];
    !r.a && r.s ? ok(`${fn}: anon refused, authenticated kept`) : fail(`${fn}: anon=${r.a} authenticated=${r.s}`);
  }
  const ia = (await c.query("select has_function_privilege('authenticated', 'public.is_admin(uuid)', 'execute') x")).rows[0].x;
  ia ? ok("is_admin still callable by authenticated (RLS needs it)") : fail("is_admin lost its grant");
} finally {
  await c.query("rollback");
  await c.end();
}
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED (rolled back, nothing changed)");
process.exitCode = failures ? 1 : 0;
