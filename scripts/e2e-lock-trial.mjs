// E2E (2026-11-24): the 3-day trial offered on the Premium LOCK SCREEN to a
// brand-new account (no result yet), and the daily-test Telegram card on the
// student's own review page. Throwaway account created and DELETED; times_done restored.
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./env.mjs";
loadEnv();
const BASE = process.argv[2] || "https://ielts-platform-dev.vercel.app";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const email = `e2e-locktrial-${Date.now()}@example.com`;
const password = "E2e-" + Math.random().toString(36).slice(2) + "A1!";
const fails = [];
const check = (ok, label) => { console.log(ok ? "✓" : "✗", label); if (!ok) fails.push(label); };

const { data: prem } = await admin.from("tests").select("id, title").eq("tier", "premium").eq("skill", "reading").or("track.is.null,track.eq.regular").order("created_at").limit(2);
const { data: freeT } = await admin.from("tests").select("id, times_done").eq("tier", "free").eq("skill", "reading").limit(1);
const { data: u, error: ue } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: "E2E Lock Trial" } });
if (ue) throw ue;
const uid = u.user.id;
const browser = await chromium.launch({ channel: "msedge" });
try {
  const page = await (await browser.newContext()).newPage();
  const body = () => page.evaluate(() => document.body.innerText);
  await page.goto(`${BASE}/login`); await page.waitForLoadState("networkidle");
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/, { timeout: 30000 });

  await page.goto(`${BASE}/reading/${prem[0].id}`); await page.waitForLoadState("networkidle");
  let t = await body();
  check(t.includes("Try every Premium test free for 3 days"), "lock screen offers the trial with no result yet");
  check(t.includes("Open this test free"), "pass button still there");
  await page.getByRole("button", { name: "Start my free trial" }).click();
  await page.waitForFunction(() => !document.body.innerText.includes("Premium test\n"), null, { timeout: 30000 });
  await page.goto(`${BASE}/reading/${prem[1].id}`); await page.waitForLoadState("networkidle");
  t = await body();
  check(!t.includes("Start my free trial") && !t.includes("Open this test free"), "another premium test opens during the trial");
  let r = await page.request.get(`${BASE}/api/test-html/${prem[1].id}`);
  check(r.status() === 200, `test-html 200 during trial (${r.status()})`);
  const { count: passes } = await admin.from("premium_passes").select("user_id", { count: "exact", head: true }).eq("user_id", uid);
  check(passes === 0, "no weekly pass spent");
  const { data: prof } = await admin.from("profiles").select("premium_until").eq("id", uid).single();
  check(prof.premium_until == null, "premium_until untouched");
  const { count: trials } = await admin.from("premium_trials").select("user_id", { count: "exact", head: true }).eq("user_id", uid);
  check(trials === 1, "exactly one trial row");

  // Review page: own attempt shows the Telegram card (if the bot is configured on this host)
  const { data: res, error: ie } = await admin.from("results").insert({ user_id: uid, test_id: freeT[0].id, skill: "reading", raw: 20, total: 40, band: 6 }).select("id").single();
  check(!ie, "inserted result " + (ie?.message ?? ""));
  await page.goto(`${BASE}/review/${res.id}`); await page.waitForLoadState("networkidle");
  t = await body();
  console.log(t.includes("Get one test a day on Telegram") ? "✓ review page shows the Telegram card" : "· review page: no Telegram card (bot not configured on this host?)");
  check(!t.includes("free Premium trial"), "review: no second trial offer");
  r = await page.request.get(`${BASE}/api/student-bot/link`, { maxRedirects: 0 });
  console.log(`  /api/student-bot/link -> ${r.status()} ${r.headers()["location"] ?? ""}`.replace(/link_[A-Za-z0-9_-]+/, "link_<code>"));
} finally {
  await browser.close();
  await admin.from("student_link_codes").delete().eq("user_id", uid);
  await admin.from("results").delete().eq("user_id", uid);
  await admin.from("tests").update({ times_done: freeT[0].times_done }).eq("id", freeT[0].id);
  await admin.auth.admin.deleteUser(uid);
  console.log("cleanup: user deleted, times_done restored");
}
console.log(fails.length ? `\nFAILED: ${fails.length}` : "\nALL PASSED");
process.exit(fails.length ? 1 : 0);
