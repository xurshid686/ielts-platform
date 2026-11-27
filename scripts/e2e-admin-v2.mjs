// E2E (2026-11-27) for admin panel v2 (+ v2.1 site header kept on /admin): shell, overview analytics (0076),
// Members paging, Student 360 actions, Tests inline edit + filters.
// A throwaway admin, a throwaway student and a throwaway test row are created
// with the service role and DELETED in `finally`. Screenshots go to argv[3].
// Usage: node scripts/e2e-admin-v2.mjs [baseUrl] [shotDir]
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync } from "node:fs";
import { loadEnv } from "./env.mjs";
loadEnv();
const BASE = process.argv[2] || "https://ielts-platform-dev.vercel.app";
const SHOTS = process.argv[3] || null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const fails = [];
const check = (ok, label) => { console.log(ok ? "✓" : "✗", label); if (!ok) fails.push(label); };
const stamp = Date.now();

async function mkUser(tag, role) {
  const email = `e2e-${tag}-${stamp}@example.com`, password = "E2e-" + Math.random().toString(36).slice(2) + "A1!";
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: `E2E ${tag}` } });
  if (error) throw error;
  if (role) await admin.from("profiles").update({ role }).eq("id", data.user.id);
  return { id: data.user.id, email, password };
}
async function login(ctx, u, expect = /dashboard/) {
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`); await page.waitForLoadState("networkidle", { timeout: 60000 });
  await page.fill('input[type="email"]', u.email); await page.fill('input[type="password"]', u.password);
  await page.click('button[type="submit"]'); await page.waitForURL(expect, { timeout: 30000 });
  return page;
}
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }); };
const text = (page) => page.evaluate(() => document.body.innerText);

const { count: accounts } = await admin.from("profiles").select("id", { count: "exact", head: true });
const boss = await mkUser("adminv2", "admin");
const student = await mkUser("adminv2-student", null);
let testId = null;
const browser = await chromium.launch({ channel: "msedge" });
try {
  // A throwaway test row for the inline-edit checks, so no real paper is touched.
  {
    const { data, error } = await admin.from("tests").insert({
      title: `E2E admin v2 ${stamp}`, skill: "reading", kind: "single", tier: "free", track: "pre_ielts", // level-gated: never in the public catalogue
      file_path: `e2e/${stamp}.html`, file_url: `https://example.com/e2e/${stamp}.html`, total: 13,
      question_types: [], answer_key: { 1: ["a"] },
    }).select("id").single();
    if (error) console.log("(could not create a throwaway test:", error.message, ") — inline edit checks skipped");
    else testId = data.id;
  }

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light" });
  const page = await login(ctx, boss);

  // ---------------------------------------------------------- shell + overview
  await page.goto(`${BASE}/admin`); await page.waitForLoadState("networkidle");
  check(await page.locator('aside nav[aria-label="Admin"]').isVisible(), "sidebar renders");
  check((await page.locator("header a[href='/leaderboard']").count()) > 0, "site header stays on /admin (v2.1)");
  check(await page.locator('header a[href="/admin"][aria-current="page"], header button:has-text("Admin")').count() > 0, "header shows the Admin entry");
  let t = await text(page);
  check(t.includes("Waiting on you"), "work-waiting panel present");
  const m = t.match(/([\d,]+) accounts in all/);
  const shown = m ? Number(m[1].replace(/,/g, "")) : -1;
  check(shown === accounts + 2 || shown === accounts, `account total is the real count (${shown}; db ${accounts}+2), not the 1000 cap`);
  check((await page.locator('svg[role="img"]').count()) >= 4, "four charts render");
  check(t.includes("Weekly cohorts") && t.includes("Live activity"), "cohorts + activity feed render");
  check(t.includes("E2E adminv2-student") || t.includes("Signed up"), "activity feed lists signups");
  await shot(page, "overview-light-1440");
  for (const d of [7, 90]) {
    await page.goto(`${BASE}/admin?days=${d}`); await page.waitForLoadState("networkidle");
    check((await text(page)).includes(`Last ${d} days`), `range ${d} days renders`);
  }

  // ---------------------------------------------------------- members
  await page.goto(`${BASE}/admin/members`); await page.waitForLoadState("networkidle");
  t = await text(page);
  const mm = t.match(/([\d,]+) accounts/);
  check(mm && Number(mm[1].replace(/,/g, "")) > 1000, `members total is uncapped (${mm?.[1]})`);
  check((await page.locator("tbody tr").count()) === 50, "first page has 50 rows");
  await page.goto(`${BASE}/admin/members?page=2&sort=xp`); await page.waitForLoadState("networkidle");
  check((await text(page)).includes("Page 2 of"), "paging works");
  await shot(page, "members-light-1440");

  // top-bar search lands on Members filtered to the student
  await page.goto(`${BASE}/admin`); await page.waitForLoadState("networkidle");
  check(await page.locator('aside input[aria-label="Find a student"]').isVisible(), "student search sits in the sidebar");
  await page.fill('input[aria-label="Find a student"]', student.email);
  await page.press('input[aria-label="Find a student"]', "Enter");
  await page.waitForURL(/members\?q=/); await page.waitForLoadState("networkidle");
  // loading.tsx streams the page in: wait for the filtered table, not just the URL.
  await page.locator("tbody tr a", { hasText: "Open" }).first().waitFor({ timeout: 20000 });
  check((await page.locator("tbody tr").count()) === 1, "sidebar search finds exactly the student");
  await page.locator("tbody tr a", { hasText: "Open" }).click();
  await page.waitForURL(/\/admin\/members\/[0-9a-f-]{36}/); await page.waitForLoadState("networkidle");

  // ---------------------------------------------------------- student 360
  t = await text(page);
  check(t.includes("E2E adminv2-student") && t.includes(student.email), "360 header shows the student");
  for (const tab of ["Tests", "Mocks", "Writing & speaking", "Money", "Reports & emails"]) check(t.includes(tab), `tab "${tab}" present`);
  await page.getByRole("button", { name: "Grant" }).first().click();
  await page.getByRole("status").waitFor({ timeout: 20000 });
  check(/Premium until/.test(await page.getByRole("status").innerText()), "grant Premium reports success");
  const { data: prof } = await admin.from("profiles").select("premium_until").eq("id", student.id).single();
  check(!!prof.premium_until && new Date(prof.premium_until) > new Date(), "premium_until written in the database");
  await page.waitForFunction(() => /until \d{4}-\d\d-\d\d/.test(document.body.innerText), null, { timeout: 20000 }).catch(() => {});
  check(/until \d{4}-\d\d-\d\d/.test(await text(page)), "Premium chip appears after refresh");
  await shot(page, "student360-light-1440");
  await page.goto(page.url().split("?")[0] + "?tab=money"); await page.waitForLoadState("networkidle");
  check((await text(page)).includes("Free passes used"), "money tab renders");

  // ---------------------------------------------------------- tests
  await page.goto(`${BASE}/admin/tests`); await page.waitForLoadState("networkidle");
  t = await text(page);
  const all = Number((t.match(/(\d+) of (\d+)/) || [])[2]);
  const { count: testCount } = await admin.from("tests").select("id", { count: "exact", head: true });
  check(all === testCount, `tests table holds every test (${all}/${testCount})`);
  await page.selectOption('select[aria-label="Filter by tier"]', "premium");
  await page.waitForFunction((n) => { const m = document.body.innerText.match(/(\d+) of (\d+)/); return m && Number(m[1]) < n; }, all, { timeout: 10000 }).catch(() => {});
  const prem = Number(((await text(page)).match(/(\d+) of (\d+)/) || [])[1]);
  check(prem > 0 && prem < all, `tier filter narrows (${prem} of ${all})`);
  await page.selectOption('select[aria-label="Filter by tier"]', "all");
  await shot(page, "tests-light-1440");
  if (testId) {
    await page.fill('input[aria-label="Search titles"]', `E2E admin v2 ${stamp}`);
    const row = page.locator("tbody tr").first();
    await row.locator('select[aria-label="Tier"]').selectOption("premium");
    await page.getByRole("status").waitFor({ timeout: 20000 });
    let { data: tr } = await admin.from("tests").select("tier, track").eq("id", testId).single();
    check(tr.tier === "premium", "inline tier edit persists");
    await row.locator('select[aria-label="Track"]').selectOption("intro");
    await page.waitForFunction(() => /Track saved/.test(document.body.innerText), null, { timeout: 20000 });
    ({ data: tr } = await admin.from("tests").select("tier, track").eq("id", testId).single());
    check(tr.track === "intro", "inline track edit persists");
    check(!(await row.locator('select[aria-label="Track"] option[value="mock"]').count()), "mock/discipline are not offered as tracks");
  }

  // ---------------------------------------------------------- dark + narrow
  const dctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, colorScheme: "dark" });
  const dpage = await login(dctx, boss);
  await dpage.evaluate(() => localStorage.setItem("theme", "dark"));
  for (const [path, name] of [["/admin", "overview"], ["/admin/tests", "tests"], [`/admin/members/${student.id}`, "student360"]]) {
    await dpage.goto(`${BASE}${path}`); await dpage.waitForLoadState("networkidle");
    await shot(dpage, `${name}-dark-1280`);
  }
  const hasOverflow = await dpage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check(!hasOverflow, "no horizontal page overflow at 1280px");

  // ---------------------------------------------------------- student side unchanged
  const sctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const spage = await login(sctx, student);
  check((await spage.locator("header a[href='/leaderboard']").count()) > 0, "student header still on /dashboard");
  await spage.goto(`${BASE}/admin`); await spage.waitForURL(/dashboard/, { timeout: 20000 });
  check(true, "non-admin is sent away from /admin");
} finally {
  await browser.close();
  if (testId) await admin.from("tests").delete().eq("id", testId);
  for (const u of [boss, student]) await admin.auth.admin.deleteUser(u.id);
  console.log("cleanup done (throwaway test + 2 users deleted)");
}
console.log(fails.length ? `\n${fails.length} FAILED` : "\nALL PASSED");
process.exit(fails.length ? 1 : 0);
