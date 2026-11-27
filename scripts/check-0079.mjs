// Checks for migration 0079 (skill ratings). Two modes:
//   node scripts/check-0079.mjs --dry   apply 0079 inside a transaction, check, ROLL BACK
//   node scripts/check-0079.mjs         check the live database after 0079 was applied
// Checks: Reading ratings unchanged by the migration (dry only), the Listening
// replay is deterministic and sane, Writing ratings match a JS recomputation,
// the profile guard blocks a client writing a skill rating, and the views exist.
import { readFileSync } from "node:fs";
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
const readingSnap = () => q(`select md5(string_agg(id::text || ':' || rating || ':' || peak_rating || ':' || rated_count, ',' order by id)) h from profiles`).then((r) => r[0].h);
const readingResults = () => q(`select md5(string_agg(id::text || ':' || rated || ':' || points || ':' || coalesce(rating_after, -1), ',' order by id)) h from results where skill = 'reading'`).then((r) => r[0].h);

try {
  await c.query("begin");
  if (DRY) {
    const [h1, r1] = [await readingSnap(), await readingResults()];
    const t0 = Date.now();
    await c.query(readFileSync("supabase/migrations/0079_skill_ratings.sql", "utf8"));
    console.log(`(migration ran in ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    check((await readingSnap()) === h1, "reading profile ratings unchanged");
    check((await readingResults()) === r1, "reading results unchanged");
  }

  const [lst] = await q(`select count(*) filter (where listening_rated_count > 0) rated_students,
      min(listening_rating) filter (where listening_rated_count > 0) mn,
      max(listening_rating) filter (where listening_rated_count > 0) mx,
      round(avg(listening_rating) filter (where listening_rated_count > 0)) av from profiles`);
  const [lres] = await q(`select count(*) filter (where rated) rated, count(*) filter (where flagged) flagged, count(*) n from results where skill = 'listening'`);
  console.log("listening:", lst, lres);
  check(Number(lst.rated_students) > 50 && Number(lst.mn) >= 500 && Number(lst.mx) <= 2900, "listening ratings are in a sane range");
  const [dist] = await q(`select count(*) filter (where listening_rating < 1100) bronze, count(*) filter (where listening_rating between 1100 and 1499) silver,
      count(*) filter (where listening_rating between 1500 and 1799) gold, count(*) filter (where listening_rating >= 1800) plat_up
      from profiles where listening_rated_count > 0`);
  console.log("listening distribution:", dist);

  if (DRY) {
    const before = await q(`select id, listening_rating from profiles where listening_rated_count > 0 order by id`);
    await q(`select public.rebuild_listening_ratings()`);
    const after = await q(`select id, listening_rating from profiles where listening_rated_count > 0 order by id`);
    check(JSON.stringify(before) === JSON.stringify(after), "listening replay is deterministic (same result twice)");
  }

  // Writing: recompute in JS for 20 students and compare.
  const ws = await q(`select id, writing_rating, writing_rated_count from profiles where writing_rated_count > 0 order by random() limit 20`);
  let mism = 0;
  for (const w of ws) {
    const ai = await q(`select coalesce(finished_at, created_at) at, results from writing_ai_checks where user_id = $1 and source = 'practice' and status = 'done'`, [w.id]);
    const mk = await q(`select coalesce(released_at, submitted_at) at, writing_task1_band t1, writing_task2_band t2 from mock_attempts where user_id = $1 and released_at >= '2026-09-18 00:00:00+05'`, [w.id]);
    const items = [];
    for (const a of ai) for (const e of Array.isArray(a.results) ? a.results : []) if (e && e.overall != null) items.push({ task: Number(e.task), band: Number(e.overall), at: new Date(a.at) });
    for (const m of mk) {
      if (m.t1 != null) items.push({ task: 1, band: Number(m.t1), at: new Date(m.at) });
      if (m.t2 != null) items.push({ task: 2, band: Number(m.t2), at: new Date(m.at) });
    }
    items.sort((a, b) => b.at - a.at);
    const last = items.slice(0, 5);
    const wsum = last.reduce((s, i) => s + (i.task === 2 ? 2 : 1), 0);
    const avg = last.reduce((s, i) => s + i.band * (i.task === 2 ? 2 : 1), 0) / wsum;
    const expect = Math.max(0, Math.min(3000, Math.round(1000 + (avg - 5) * 425)));
    if (Math.abs(expect - w.writing_rating) > 1 || items.length !== w.writing_rated_count) { mism++; console.log("  writing mismatch", w, expect, items.length); }
  }
  check(ws.length > 0 && mism === 0, `writing ratings match the JS recomputation (${ws.length} students)`);

  for (const v of ["leaderboard_overall", "leaderboard_listening", "leaderboard_writing"]) {
    const [r] = await q(`select count(*) n from ${v}`);
    check(Number(r.n) > 0, `${v} has rows (${r.n})`);
  }
  const [o] = await q(`select * from leaderboard_overall order by rank limit 1`);
  console.log("overall #1:", o?.name, o?.rating, `${o?.skills} skills`);

  // The guard: a signed-in student can't write their own listening rating.
  const [someone] = await q(`select id from profiles where role <> 'admin' limit 1`);
  await c.query("savepoint g");
  await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: someone.id, role: "authenticated" })]);
  await c.query("set local role authenticated");
  let blocked = false;
  try { await c.query(`update profiles set listening_rating = 2900 where id = $1`, [someone.id]); }
  catch (e) { blocked = /privileged/.test(e.message); }
  await c.query("rollback to savepoint g");
  await c.query("reset role");
  check(blocked, "guard blocks a client writing listening_rating");

  // anon can't read the new views
  await c.query("savepoint a");
  await c.query("set local role anon");
  let anonBlocked = false;
  try { await c.query(`select 1 from leaderboard_overall limit 1`); } catch { anonBlocked = true; }
  await c.query("rollback to savepoint a");
  await c.query("reset role");
  check(anonBlocked, "anon can't read leaderboard_overall");
} catch (e) {
  console.error("ERR", e.message);
  fails.push(e.message);
} finally {
  await c.query(DRY ? "rollback" : "rollback").catch(() => {});
  await c.end();
  console.log(DRY ? "(dry run rolled back)" : "(read-only checks; nothing written)");
}
console.log(fails.length ? `\n${fails.length} FAILED` : "\nALL PASSED");
process.exit(fails.length ? 1 : 0);
