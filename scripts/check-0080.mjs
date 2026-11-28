// Checks for migration 0080 (the Friends buyer's pre-group Premium date).
//   node scripts/check-0080.mjs --dry   apply 0080 inside a transaction, check, ROLL BACK
//   node scripts/check-0080.mjs         check the live database after 0080 was applied (also rolled back)
// Everything runs in ONE transaction that is always rolled back: the throwaway users, the
// group and every Premium change disappear, and the signup trigger's pg_net push (a queued
// row) is rolled back with them.
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { loadEnv } from "./env.mjs";
loadEnv();
const DRY = process.argv.includes("--dry");
const c = new pg.Client({
  host: "aws-0-eu-central-1.pooler.supabase.com", port: 5432,
  user: `postgres.${process.env.NEW_PROJECT_REF}`, password: process.env.NEW_DB_PASS,
  database: "postgres", ssl: { rejectUnauthorized: false },
});
await c.connect();
const q = async (s, p) => (await c.query(s, p)).rows;
const fails = [];
const check = (ok, label) => { console.log(ok ? "✓" : "✗", label); if (!ok) fails.push(label); };

async function user(tag) {
  const id = randomUUID();
  await q(
    `insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
     values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2, $3, now(), now())`,
    [id, `check-0080-${tag}-${Date.now()}@example.com`, JSON.stringify({ name: `Check ${tag}` })],
  );
  return id;
}

try {
  await c.query("begin");
  if (DRY) await c.query(readFileSync("supabase/migrations/0080_friends_owner_premium_before.sql", "utf8"));

  const buyer = await user("buyer");
  const friend = await user("friend");
  const admin = await user("admin");
  await q(`update profiles set role = 'admin' where id = $1`, [admin]);
  // The buyer already has personal Premium for 10 more days; the group runs a month.
  const [{ own }] = await q(`update profiles set premium_until = now() + interval '10 days' where id = $1 returning premium_until own`, [buyer]);

  // "select * from fn()", never "select (fn()).*": the latter runs the function once PER COLUMN.
  const [g] = await q(`select * from public.friends_extend($1, 1, null)`, [buyer]);
  const [row] = await q(`select premium_before from premium_group_members where group_id = $1 and user_id = $2`, [g.id, buyer]);
  check(row && +new Date(row.premium_before) === +new Date(own), "the buyer's row keeps their own Premium date (premium_before)");
  const [{ pu }] = await q(`select premium_until pu from profiles where id = $1`, [buyer]);
  if (+new Date(pu) !== +new Date(g.expires_at)) console.log("   debug:", { own, pu, groupEnd: g.expires_at });
  check(+new Date(pu) === +new Date(g.expires_at), "the group still raises the buyer to the group's end");

  await q(`select public.friends_add_member($1, $2)`, [g.id, friend]);
  const [{ r: changed }] = await q(`select public.admin_friends_set_owner_as($1, $2, $3) r`, [admin, g.id, friend]);
  check(changed === "changed", "admin changes the buyer to the friend");
  const [{ r: left }] = await q(`select public.friends_leave($1) r`, [buyer]);
  check(left === "left", "the old buyer leaves the group");
  const [{ pu: after }] = await q(`select premium_until pu from profiles where id = $1`, [buyer]);
  check(+new Date(after) === +new Date(own), "the old buyer gets their own 10 days back (not cut to now)");

  const [{ a, s }] = await q(`select has_function_privilege('authenticated', 'public.friends_extend(uuid,int,uuid)', 'execute') a,
                                     has_function_privilege('service_role', 'public.friends_extend(uuid,int,uuid)', 'execute') s`);
  check(!a && s, "friends_extend stays service-role only");
} catch (e) {
  check(false, `error: ${e.message}`);
} finally {
  await c.query("rollback");
  await c.end();
}
console.log(fails.length ? `\n${fails.length} FAILED (rolled back)` : "\nall passed (rolled back, nothing kept)");
process.exit(fails.length ? 1 : 0);
