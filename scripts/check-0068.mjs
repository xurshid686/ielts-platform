// Check for migration 0068 (the referral program is gone), against the LIVE database.
//
//   node scripts/check-0068.mjs
//
// 1. The objects are gone (columns, table, functions, trigger) and nothing references referral.
// 2. The archive exists and an ANON key cannot read it.
// 3. SIGN-UP STILL WORKS (the thing most at risk): a throwaway account gets a profile row.
// 4. The profile guard still works: that account can change its own name but NOT its xp or premium.
// The throwaway account is deleted in `finally`.
import pg from "pg";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./env.mjs";

const { url, serviceKey, anonKey } = loadEnv();
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const out = [];
const say = (ok, label, detail = "") => out.push({ ok, label, detail });

const db = new pg.Client({
  host: "aws-0-eu-central-1.pooler.supabase.com",
  port: 5432,
  user: `postgres.${process.env.NEW_PROJECT_REF}`,
  password: process.env.NEW_DB_PASS,
  database: "postgres",
  ssl: { rejectUnauthorized: false },
});
await db.connect();
const q = async (s) => (await db.query(s)).rows;

let userId = null;
try {
  const cols = await q(`select column_name from information_schema.columns where table_schema='public' and table_name='profiles' and column_name in ('referral_code','referred_by')`);
  say(cols.length === 0, "profiles has no referral_code / referred_by", cols.map((c) => c.column_name).join(","));
  say((await q(`select to_regclass('public.referrals') t`))[0].t === null, "public.referrals is gone");
  const fns = await q(`select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname in ('redeem_referral','gen_referral_code','referral_reward_months','referral_welcome_xp','qualify_referral_on_result')`);
  say(fns.length === 0, "the five referral functions are gone", fns.map((f) => f.proname).join(","));
  const trg = await q(`select tgname from pg_trigger where tgname = 'on_result_referral'`);
  say(trg.length === 0, "the on_result_referral trigger is gone");
  const left = await q(`select n.nspname, p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prokind='f' and (pg_get_functiondef(p.oid) ilike '%referral%' or pg_get_functiondef(p.oid) ilike '%referred_by%')`);
  say(left.length === 0, "no function in the database still mentions referral", left.map((f) => f.proname).join(","));
  const arch = await q(`select count(*)::int n from archive.referrals`);
  say(arch[0].n > 0, "archive.referrals kept the old rows", String(arch[0].n));
  const arch2 = await q(`select count(*)::int n from archive.profile_referral_codes`);
  say(arch2[0].n > 0, "archive.profile_referral_codes kept the old codes", String(arch2[0].n));
  const priv = await q(`select has_schema_privilege('anon','archive','USAGE') a, has_schema_privilege('authenticated','archive','USAGE') b`);
  say(!priv[0].a && !priv[0].b, "anon / authenticated cannot use the archive schema");

  // sign-up
  const email = `claude-0068-check-${randomBytes(4).toString("hex")}@example.com`;
  const password = randomBytes(12).toString("base64url") + "Aa1!";
  const { data: created, error: ce } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  say(!ce, "creating an account works (handle_new_user runs)", ce?.message ?? "");
  userId = created?.user?.id ?? null;
  let prof = null;
  for (let i = 0; i < 10 && userId; i++) {
    prof = (await admin.from("profiles").select("id, name, email").eq("id", userId).maybeSingle()).data;
    if (prof) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  say(!!prof && prof.email === email, "the new account got its profile row", prof ? prof.name : "no row");

  // the guard
  const anon = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error: le } = await anon.auth.signInWithPassword({ email, password });
  say(!le, "the new account can sign in", le?.message ?? "");
  const { error: e1 } = await anon.from("profiles").update({ name: "Check Student" }).eq("id", userId);
  say(!e1, "a student can change their own name", e1?.message ?? "");
  const { error: e2 } = await anon.from("profiles").update({ xp: 999 }).eq("id", userId);
  say(!!e2 && /privileged/i.test(e2.message), "...but NOT their xp (the guard still works)", e2?.message ?? "the update was allowed");
  const { error: e3 } = await anon.from("profiles").update({ premium_until: new Date(Date.now() + 864e5).toISOString() }).eq("id", userId);
  say(!!e3 && /privileged/i.test(e3.message), "...and NOT their Premium", e3?.message ?? "the update was allowed");
} catch (e) {
  say(false, "check crashed", e.message.split("\n")[0]);
} finally {
  if (userId) await admin.auth.admin.deleteUser(userId);
  await db.end();
  console.log("throwaway account deleted");
}
let bad = 0;
for (const r of out) {
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.label}${r.detail ? "  -> " + r.detail : ""}`);
  if (!r.ok) bad++;
}
process.exit(bad ? 1 : 0);
