// E2E for the "Today" dashboard + Progress page (2026-11-28).
// Throwaway accounts (new / free with results / Premium) are created with the service role
// and DELETED in `finally`; results are deleted and the touched tests' times_done restored.
//
//   node scripts/e2e-dashboard.mjs [baseUrl] [shotDir]

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync } from "node:fs";
import { loadEnv } from "./env.mjs";

loadEnv();
const BASE = (process.argv[2] || "https://ielts-platform-dev.vercel.app").replace(/\/+$/, "");
const SHOTS = process.argv[3] || null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const fails = [];
const check = (ok, label) => { console.log(ok ? "✓" : "✗", label); if (!ok) fails.push(label); };
const stamp = Date.now();
const users = [];
const touched = new Map(); // test id -> original times_done

async function mkUser(tag) {
  const email = `e2e-dash-${tag}-${stamp}@example.com`, password = "E2e-" + Math.random().toString(36).slice(2) + "A1!";
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: `Dash ${tag}` } });
  if (error) throw error;
  // Tashkent, so "today" in the checks matches the student's day.
  await admin.from("profiles").update({ timezone: "Asia/Tashkent" }).eq("id", data.user.id);
  const u = { id: data.user.id, email, password };
  users.push(u);
  return u;
}
async function addResult(userId, test, { raw, total = 40, band, at }) {
  if (!touched.has(test.id)) touched.set(test.id, test.times_done);
  const { error } = await admin.from("results").insert({ user_id: userId, test_id: test.id, skill: "reading", raw, total, band, submitted_at: at });
  if (error) throw new Error("insert result: " + error.message);
}
async function login(ctx, u) {
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`); await page.waitForLoadState("networkidle", { timeout: 60000 });
  await page.fill('input[type="email"]', u.email); await page.fill('input[type="password"]', u.password);
  await page.click('button[type="submit"]'); await page.waitForURL(/dashboard/, { timeout: 30000 });
  return page;
}
async function open(page, path) {
  await page.goto(`${BASE}${path}`); await page.waitForLoadState("networkidle", { timeout: 60000 });
}
// The page body only: the site header's nav lists every section (Speaking included).
const text = (page) => page.evaluate(() => (document.querySelector("main") ?? document.body).innerText);
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }); };
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();

/** Every row of the card grid is full: two cards side by side, or one card spanning the row. */
async function gridBalanced(page) {
  return page.evaluate(() => {
    const grid = document.querySelector("[data-dashboard-grid]");
    if (!grid) return { ok: false, why: "no grid" };
    const gw = grid.getBoundingClientRect().width;
    const rows = new Map();
    for (const el of grid.children) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const key = Math.round(r.top);
      rows.set(key, [...(rows.get(key) ?? []), r]);
    }
    for (const [, rs] of rows) {
      if (rs.length === 1 && Math.abs(rs[0].width - gw) > 2) return { ok: false, why: `a lone half-width card (${Math.round(rs[0].width)} of ${Math.round(gw)})` };
      if (rs.length === 2 && Math.abs(rs[0].height - rs[1].height) > 2) return { ok: false, why: "uneven heights in a row" };
    }
    return { ok: true, rows: rows.size };
  });
}

const browser = await chromium.launch({ channel: "msedge" });
try {
  // Free reading tests that share a question type: the weak type we will create.
  const { data: free } = await admin.from("tests").select("id, title, question_types, times_done").eq("skill", "reading").eq("tier", "free").or("track.is.null,track.eq.regular");
  const tagged = (free ?? []).filter((t) => (t.question_types ?? []).length);
  const type = tagged[0].question_types[0];
  const weakTests = tagged.filter((t) => t.question_types.includes(type)).slice(0, 2);
  const weakTypes = new Set(weakTests.flatMap((t) => t.question_types));
  // A strong result on a paper sharing none of those types, so the weak type is unambiguous.
  const other = tagged.find((t) => !weakTests.includes(t) && !t.question_types.some((q) => weakTypes.has(q))) ?? tagged.find((t) => !weakTests.includes(t));
  check(weakTests.length >= 1 && !!other, `fixtures: weak type "${type}" on ${weakTests.length} free test(s)`);

  // ---------------------------------------------------------------- new account
  const N = await mkUser("new");
  {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 740 } });
    const page = await login(ctx, N);
    await open(page, "/dashboard");
    const card = page.locator('[data-today-card]');
    check((await card.getAttribute("data-today-card")) === "todo" && /your first test/i.test(await card.innerText()), "new account: 'Your first test'");
    const box = await card.boundingBox();
    check(!!box && box.y < 740, "new account: the Today card is visible without scrolling on a 375x740 phone");
    check(/your first test appears|finish your first test/i.test(await card.innerText()), "new account: the bands zone explains itself instead of empty bars");
    await shot(page, "01-new-375");
    await card.getByRole("link", { name: /Start the test/ }).click();
    await page.waitForURL(/\/reading\//, { timeout: 30000 });
    check(/\/reading\//.test(page.url()), "new account: Start opens a reading test");
    await ctx.close();
  }

  // ---------------------------------------------------------------- free student with results
  const F = await mkUser("free");
  for (const t of weakTests) await addResult(F.id, t, { raw: 8, band: 3.5, at: daysAgo(3) });
  await addResult(F.id, other, { raw: 36, band: 8, at: daysAgo(2) });
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await login(ctx, F);
    await open(page, "/dashboard");
    const card = page.locator('[data-today-card]');
    const cardText = await card.innerText();
    check((await card.getAttribute("data-today-card")) === "todo" && /today's test/i.test(cardText), "free student: Today's test card");
    check([...weakTypes].some((q) => cardText.includes(`Trains ${q}`)), `free student: the pick trains a weak type (${[...weakTypes].join(" / ")})`);
    const startHref = await card.getByRole("link", { name: /Start the test/ }).getAttribute("href");
    check(!!startHref && startHref.startsWith("/reading/") && !weakTests.some((t) => startHref.includes(t.id)), "free student: picks an unattempted paper");
    const passes = page.locator('section[aria-label="Free Premium tests this week"]');
    check(await passes.isVisible(), "free student: passes card visible");
    check((await passes.innerText()).includes("3 free Premium tests left this week"), "passes card: 3 left");
    check((await passes.locator("a").count()) >= 1, "passes card: lists Premium papers");
    const body = await text(page);
    check(body.includes("free Premium trial"), "free student: trial offered (has a result, never trialled)");
    check(await page.locator("[data-today-card] [data-bands]").isVisible(), "free student: the bands sit inside the Today hero");
    check(/your bands/i.test(body) && body.includes("Overall"), "free student: bands panel");
    const g1 = await gridBalanced(page);
    check(g1.ok, `free student: card rows are full (${g1.why ?? g1.rows + " rows"})`);
    check(body.includes("All your progress"), "free student: recent activity links to Progress");
    check(!/\bSpeaking\b/.test(body), "Today: no Speaking");
    await shot(page, "02-free-1280-light");

    const { count: spent } = await admin.from("premium_passes").select("test_id", { count: "exact", head: true }).eq("user_id", F.id);
    check((spent ?? 0) === 0, "visiting the dashboard spends no pass");

    // Phone + dark theme.
    const dark = await browser.newContext({ viewport: { width: 375, height: 740 }, colorScheme: "dark" });
    await dark.addInitScript(() => localStorage.setItem("theme", "dark"));
    const p2 = await login(dark, F);
    await open(p2, "/dashboard");
    const overflow = await p2.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(overflow <= 0, `375px: no horizontal scroll (${overflow}px)`);
    await shot(p2, "03-free-375-dark");

    // Progress page.
    await page.getByRole("link", { name: "Progress" }).first().click();
    await page.waitForURL(/\/dashboard\/progress/, { timeout: 30000 });
    await page.getByRole("heading", { name: "Your progress" }).waitFor({ timeout: 30000 });
    await page.waitForLoadState("networkidle");
    const prog = await text(page);
    check(prog.includes("Your progress") && prog.includes("What to practise next") && prog.includes("Question-type accuracy"), "Progress: headline sections render");
    check(prog.includes("Set your target band") || prog.includes("target"), "Progress: goal tracker");
    check(!/\bSpeaking\b/.test(prog), "Progress: no Speaking");
    check(!prog.includes("Coming soon"), "Progress: Writing never says 'Coming soon'");
    await shot(page, "04-progress-1280");

    // Done today.
    await addResult(F.id, weakTests[0], { raw: 30, band: 7, at: new Date().toISOString() });
    await open(page, "/dashboard");
    const done = page.locator('[data-today-card]');
    const doneText = await done.innerText();
    check((await done.getAttribute("data-today-card")) === "done" && /done for today/i.test(doneText) && doneText.includes("Band 7"), "after a test today: 'Done for today' with the band");
    check(doneText.includes("Another one?"), "done state offers another paper");
    await shot(page, "05-done-1280");
    await ctx.close();
    await dark.close();
  }

  // ---------------------------------------------------------------- Premium student
  const P = await mkUser("premium");
  await admin.from("profiles").update({ premium_until: new Date(Date.now() + 30 * 86400000).toISOString() }).eq("id", P.id);
  await addResult(P.id, other, { raw: 20, band: 5.5, at: daysAgo(1) });
  await admin.from("student_bot_links").insert({ user_id: P.id, chat_id: 4_000_000_000_000_000 + Math.floor(Math.random() * 1e12), daily_on: false });
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await login(ctx, P);
    await open(page, "/dashboard");
    const body = await text(page);
    check(!(await page.locator('section[aria-label="Free Premium tests this week"]').count()), "Premium: no passes card");
    check(!body.includes("free Premium trial"), "Premium: no trial offer");
    check(!(await page.locator('[data-today-card]').innerText()).includes("Uses 1 of your"), "Premium: the pick never asks for a pass");
    const g2 = await gridBalanced(page);
    check(g2.ok, `Premium with few cards: rows are full (${g2.why ?? g2.rows + " rows"})`);
    await shot(page, "06-premium-telegram-linked-1280");
    await ctx.close();
  }
} finally {
  await browser.close();
  for (const u of users) {
    await admin.from("results").delete().eq("user_id", u.id);
    await admin.from("premium_passes").delete().eq("user_id", u.id);
    await admin.from("student_bot_links").delete().eq("user_id", u.id);
    const { error } = await admin.auth.admin.deleteUser(u.id);
    if (error) console.log("cleanup failed:", u.email, error.message);
  }
  for (const [id, td] of touched) await admin.from("tests").update({ times_done: td }).eq("id", id);
  console.log(`cleanup: ${users.length} accounts deleted, times_done restored on ${touched.size} tests`);
}
console.log(fails.length ? `\n${fails.length} FAILED` : "\nall passed");
process.exit(fails.length ? 1 : 0);
