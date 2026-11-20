// READ-ONLY: everything in the LIVE database that references the referral feature.
//
//   node scripts/check-referral-deps.mjs
//
// Lists: functions whose source mentions referral/referred_by, triggers on profiles/results/auth.users,
// policies, views and constraints touching the two profile columns, and the live definitions of the
// two functions that MUST be rewritten before the columns can be dropped. Changes nothing.
import pg from "pg";
import { loadEnv } from "./env.mjs";

loadEnv();
const client = new pg.Client({
  host: "aws-0-eu-central-1.pooler.supabase.com",
  port: 5432,
  user: `postgres.${process.env.NEW_PROJECT_REF}`,
  password: process.env.NEW_DB_PASS,
  database: "postgres",
  ssl: { rejectUnauthorized: false },
});
await client.connect();
const q = async (sql, p = []) => (await client.query(sql, p)).rows;
try {
  console.log("== functions whose source mentions referral / referred_by");
  for (const r of await q(`select n.nspname, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public','private','auth') and p.prokind = 'f' and (pg_get_functiondef(p.oid) ilike '%referral%' or pg_get_functiondef(p.oid) ilike '%referred_by%') order by 1,2`)) console.log("  ", r.nspname + "." + r.proname);

  console.log("== triggers on profiles / results / auth.users");
  for (const r of await q(`select c.relname tbl, t.tgname, pg_get_triggerdef(t.oid) def from pg_trigger t join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace where not t.tgisinternal and ((n.nspname='public' and c.relname in ('profiles','results','referrals')) or (n.nspname='auth' and c.relname='users')) order by 1,2`)) console.log("  ", r.tbl, "|", r.tgname);

  console.log("== policies mentioning the referral objects");
  for (const r of await q(`select tablename, policyname from pg_policies where coalesce(qual,'') ilike '%referr%' or coalesce(with_check,'') ilike '%referr%'`)) console.log("  ", r.tablename, r.policyname);

  console.log("== views mentioning them");
  for (const r of await q(`select schemaname, viewname from pg_views where definition ilike '%referr%'`)) console.log("  ", r.schemaname + "." + r.viewname);

  console.log("== other tables with a foreign key to referrals / constraints on the columns");
  for (const r of await q(`select conrelid::regclass::text as tbl, conname, pg_get_constraintdef(oid) def from pg_constraint
    where (confrelid = 'public.referrals'::regclass) or (conrelid = 'public.profiles'::regclass and pg_get_constraintdef(oid) ilike '%referr%')`)) console.log("  ", r.tbl, r.conname, "|", r.def);

  console.log("== LIVE handle_new_user()");
  for (const r of await q(`select pg_get_functiondef(p.oid) d from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='handle_new_user'`)) console.log(r.d);
  console.log("== LIVE protect_profile_privileged_fields()");
  for (const r of await q(`select pg_get_functiondef(p.oid) d from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='protect_profile_privileged_fields'`)) console.log(r.d);
  console.log("== profile columns");
  console.log("  ", (await q(`select column_name, is_nullable from information_schema.columns where table_schema='public' and table_name='profiles' and column_name in ('referral_code','referred_by')`)).map((r) => `${r.column_name}(${r.is_nullable === "YES" ? "null" : "not null"})`).join(", "));
} finally {
  await client.end();
}
