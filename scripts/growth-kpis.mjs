// Growth KPIs, READ-ONLY (a read-only transaction against the live database).
// Run before and after every growth release; paste the output into the
// director log. Baseline: 2026-11-23.
//
//   node scripts/growth-kpis.mjs
import pg from "pg";
import { loadEnv } from "./env.mjs";
loadEnv();
const c = new pg.Client({
  host: "aws-0-eu-central-1.pooler.supabase.com", port: 5432,
  user: `postgres.${process.env.NEW_PROJECT_REF}`, password: process.env.NEW_DB_PASS,
  database: "postgres", ssl: { rejectUnauthorized: false },
});
await c.connect();
await c.query("begin read only");
const q = async (label, sql) => {
  try {
    await c.query("savepoint s");
    const r = await c.query(sql);
    console.log(`\n### ${label}`);
    console.table(r.rows);
  } catch (e) {
    await c.query("rollback to savepoint s");
    console.log(`\n### ${label}: ${e.message}`);
  }
};

await q("totals", `select count(*) accounts,
  count(*) filter (where created_at > now()-interval '7 days') new_7d,
  count(*) filter (where premium_until > now()) premium_active
  from profiles`);
await q("weekly cohorts (signup week -> took a test -> came back another day -> premium ever)", `
  with p as (select id, created_at, premium_until from profiles where created_at > now()-interval '8 weeks'),
  r as (select user_id, count(distinct submitted_at::date) days from results group by user_id)
  select date_trunc('week', p.created_at)::date wk, count(*) signups,
    count(r.user_id) took_test, round(100.0*count(r.user_id)/count(*)) pct_took,
    count(*) filter (where r.days >= 2) returned_2days,
    count(*) filter (where p.premium_until is not null) premium
  from p left join r on r.user_id = p.id group by 1 order by 1`);
await q("weekly active students", `select date_trunc('week', submitted_at)::date wk, count(*) results,
  count(distinct user_id) active from results where submitted_at > now()-interval '8 weeks' group by 1 order by 1`);
await q("catalogue by tier", `select skill, tier, count(*) from tests where coalesce(track,'regular')='regular' group by 1,2 order by 1,2`);
await q("weekly passes (0069)", `select week_start, count(*) passes, count(distinct user_id) students
  from premium_passes group by 1 order by 1 desc limit 8`);
await q("trials (0069): started, active, converted to paid", `select count(*) started,
  count(*) filter (where t.ends_at > now()) active,
  count(*) filter (where p.premium_until is not null) paid_after
  from premium_trials t join profiles p on p.id = t.user_id`);
await q("student bot (0070)", `select count(*) linked, count(*) filter (where daily_on) daily_on from student_bot_links`);
await c.query("rollback");
await c.end();
