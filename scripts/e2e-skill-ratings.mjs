// E2E (2026-11-27) for skill ratings (0079): a listening result is rated by
// apply_rating and moves the Listening ladder; the dashboard shows Overall +
// skills; /leaderboard has Overall/Reading/Listening/Writing/Groups tabs; the
// public profile shows the skills block; the premium page shows no Payme/Click.
// Throwaway student + throwaway (pre_ielts) listening test, DELETED in `finally`.
// Usage: node scripts/e2e-skill-ratings.mjs [baseUrl] [shotDir]
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
let user = null, testId = null;
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }); };
const body = (p) => p.locator("body").innerText();
const goto = async (p, path) => {
  await p.goto(`${BASE}${path}`);
  await p.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  const b = p.getByRole("button", { name: /Let.s go/ });
  if (await b.isVisible().catch(() => false)) await b.click();
};

const browser = await chromium.launch({ channel: "msedge" });
try {
  const email = `e2e-skill-${stamp}@example.com`, password = "E2e-" + Math.random().toString(36).slice(2) + "A1!";
  const { data: u, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: "E2E skills" } });
  if (error) throw error;
  user = { id: u.user.id, email, password };
  await admin.from("profiles").update({ name: `E2E skills ${stamp % 10000}` }).eq("id", user.id);

  // A rated listening first attempt (service role = no auth.uid(), allowed by apply_rating).
  const { data: t, error: te } = await admin.from("tests").insert({
    title: `E2E listening ${stamp}`, skill: "listening", kind: "single", tier: "free", track: "pre_ielts",
    file_path: `e2e/${stamp}.html`, file_url: `https://example.com/e2e/${stamp}.html`, total: 40,
    question_types: [], answer_key: { 1: ["a"] },
  }).select("id").single();
  if (te) throw te;
  testId = t.id;
  const { data: res, error: re } = await admin.from("results").insert({
    user_id: user.id, test_id: testId, skill: "listening", raw: 34, total: 40, band: 7.5, duration_seconds: 1500,
    submitted_at: new Date().toISOString(),
  }).select("id").single();
  if (re) throw re;
  const { data: rated } = await admin.rpc("apply_rating", { p_result_id: res.id });
  const r0 = Array.isArray(rated) ? rated[0] : rated;
  check(r0?.rated === true && r0.rating_delta > 0, `listening result is rated (+${r0?.rating_delta})`);
  const { data: prof } = await admin.from("profiles").select("rating, rated_count, listening_rating, listening_rated_count").eq("id", user.id).single();
  check(prof.listening_rated_count === 1 && prof.listening_rating > 1000, `listening ladder moved (${prof.listening_rating})`);
  check(prof.rated_count === 0 && prof.rating === 1000, "reading ladder untouched by a listening test");

  // ------------------------------------------------ UI
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`); await page.waitForLoadState("networkidle");
  await page.fill('input[type="email"]', email); await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]'); await page.waitForURL(/dashboard/, { timeout: 30000 });
  await goto(page, "/dashboard");
  const card = page.locator('[aria-label="Skill ratings"]');
  check(await card.isVisible(), "dashboard shows the skill ratings card");
  const listeningTile = await card.locator('[data-skill="listening"]').innerText();
  check(listeningTile.includes(String(prof.listening_rating)), "Listening tile shows the new rating");
  check((await card.innerText()).includes(String(prof.listening_rating)) && (await card.innerText()).includes("1 of 3"), "Overall = Listening while it's the only rated skill");
  await shot(page, "dashboard-skills");

  await goto(page, "/leaderboard");
  for (const tab of ["Overall", "Reading", "Listening", "Writing", "Weekly", "Monthly", "Groups"]) {
    check((await page.getByRole("button", { name: tab, exact: true }).count()) === 1, `leaderboard has the ${tab} tab`);
  }
  check((await body(page)).includes("Compete in Reading, Listening and Writing"), "leaderboard copy covers all skills");
  await page.getByRole("button", { name: "Listening", exact: true }).click();
  await page.waitForTimeout(300);
  check((await body(page)).includes("E2E skills"), "student appears on the Listening board (own row at least)");
  await shot(page, "leaderboard-listening");
  await page.getByRole("button", { name: "Writing", exact: true }).click();
  check((await body(page)).includes("3 checked essays"), "Writing tab explains the 3-essay start");

  await goto(page, `/u/${user.id}`);
  check(await page.locator('[aria-label="Skill ratings"]').isVisible(), "public profile shows the skills block");
  await shot(page, "profile-skills");

  // ------------------------------------------------ payments paused
  await goto(page, "/premium");
  const t2 = await body(page);
  check(!/Payme|Click|Pay online|Coming soon/.test(t2), "/premium shows no Payme / Click / Coming soon");
  await page.locator('button[data-buy="premium"]').click();
  const dlg = page.getByRole("dialog");
  await dlg.waitFor();
  const dt = await dlg.innerText();
  const methods = await dlg.locator("[data-method]").evaluateAll((els) => els.map((e) => e.getAttribute("data-method")));
  check(dt.includes("Telegram") && JSON.stringify(methods) === '["telegram"]', `checkout dialog offers Telegram only (${methods})`);
  await shot(page, "premium-telegram-only");
  await ctx.close();
} finally {
  await browser.close();
  if (user) await admin.from("results").delete().eq("user_id", user.id);
  if (testId) await admin.from("tests").delete().eq("id", testId);
  if (user) await admin.auth.admin.deleteUser(user.id);
  console.log("cleanup done (1 user + 1 throwaway test deleted)");
}
console.log(fails.length ? `\n${fails.length} FAILED` : "\nALL PASSED");
process.exit(fails.length ? 1 : 0);
