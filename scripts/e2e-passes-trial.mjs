// E2E for 0069 on the dev preview: weekly passes + 3-day trial.
// Throwaway account created and DELETED (finally). times_done restored.
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./env.mjs";
loadEnv();
const BASE = process.argv[2] || "https://ielts-platform-dev.vercel.app";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const email = `e2e-passes-${Date.now()}@example.com`;
const password = "E2e-" + Math.random().toString(36).slice(2) + "A1!";
const fails = [];
const check = (ok, label) => { console.log(ok ? "✓" : "✗", label); if (!ok) fails.push(label); };

const { data: prem } = await admin.from("tests").select("id, title, times_done").eq("tier", "premium").eq("skill", "reading").or("track.is.null,track.eq.regular").order("created_at").limit(5);
const { data: freeT } = await admin.from("tests").select("id, times_done").eq("tier", "free").eq("skill", "reading").limit(1);
const { data: u, error: ue } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: "E2E Passes" } });
if (ue) throw ue;
const uid = u.user.id;
const browser = await chromium.launch({ channel: "msedge" });
try {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`); await page.waitForLoadState("networkidle");
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/, { timeout: 30000 });
  check(true, "signed in");

  const body = async () => page.evaluate(() => document.body.innerText);
  // Guest-style refusal before claiming
  let r = await page.request.get(`${BASE}/api/test-key/${prem[0].id}`);
  check(r.status() === 403, `key 403 before pass (${r.status()})`);

  for (let i = 0; i < 3; i++) {
    await page.goto(`${BASE}/reading/${prem[i].id}`); await page.waitForLoadState("networkidle");
    const t = await body();
    check(t.includes(`${3 - i} of 3`), `lock shows ${3 - i} of 3 left`);
    await page.getByRole("button", { name: "Open this test free" }).click();
    await page.waitForFunction(() => !document.body.innerText.includes("Open this test free"), null, { timeout: 30000 });
    check(!(await body()).includes("Premium test\n"), `test ${i + 1} opens after claim`);
    r = await page.request.get(`${BASE}/api/test-html/${prem[i].id}`);
    check(r.status() === 200, `test-html 200 after pass (${r.status()})`);
  }
  await page.goto(`${BASE}/reading/${prem[3].id}`); await page.waitForLoadState("networkidle");
  check((await body()).includes("used this week"), "4th test: passes used up message");
  r = await page.request.get(`${BASE}/api/test-key/${prem[3].id}`);
  check(r.status() === 403, `4th test key still 403 (${r.status()})`);

  await page.goto(`${BASE}/reading`); await page.waitForLoadState("networkidle");
  // passes used up => no "Free this week" label
  check(!(await body()).includes("Free this week"), "catalogue: no 'Free this week' once used up");

  // Trial: not offered before any result
  await page.goto(`${BASE}/dashboard`); await page.waitForLoadState("networkidle");
  check(!(await body()).includes("free Premium trial"), "no trial offer before first result");
  // Insert one result (service role) to simulate the first test
  const { error: ie } = await admin.from("results").insert({ user_id: uid, test_id: freeT[0].id, skill: "reading", raw: 20, total: 40, band: 6 });
  check(!ie, "inserted result " + (ie?.message ?? ""));
  await page.goto(`${BASE}/dashboard`); await page.waitForLoadState("networkidle");
  check((await body()).includes("free Premium trial"), "trial offered after first result");
  await page.getByRole("button", { name: "Start my free trial" }).click();
  await page.waitForFunction(() => document.body.innerText.includes("trial has started") || document.body.innerText.includes("Free trial:"), null, { timeout: 30000 });
  await page.goto(`${BASE}/dashboard`); await page.waitForLoadState("networkidle");
  const d = await body();
  check(d.includes("Free trial:"), "trial banner visible");
  check(!d.includes("Start my free trial"), "offer gone after start");
  r = await page.request.get(`${BASE}/api/test-key/${prem[4].id}`);
  check(r.status() !== 403, `trial opens untouched premium test key (${r.status()})`);
  const { data: prof } = await admin.from("profiles").select("premium_until").eq("id", uid).single();
  check(prof.premium_until == null, "premium_until untouched by trial");

  // Guest still refused
  const guest = await browser.newContext();
  r = await guest.request.get(`${BASE}/api/test-key/${prem[4].id}`);
  check(r.status() === 403 || r.status() === 401, `guest key refused (${r.status()})`);
} finally {
  await browser.close();
  await admin.from("results").delete().eq("user_id", uid);
  await admin.from("tests").update({ times_done: freeT[0].times_done }).eq("id", freeT[0].id);
  await admin.auth.admin.deleteUser(uid);
  console.log("cleanup: user deleted, times_done restored");
}
console.log(fails.length ? `\nFAILED: ${fails.length}` : "\nALL PASSED");
process.exit(fails.length ? 1 : 0);
