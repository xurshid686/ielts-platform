// Screenshots for the Friends guide page (/premium/friends), 2026-11-27.
// Builds a demo group on the target site: buyer "Aziz", members "Madina" and
// "Jasur", "Laylo" invited. Takes element screenshots into public/friends/ and
// DELETES every throwaway user, test and result in `finally`.
// Usage: node scripts/friends-screenshots.mjs [baseUrl]
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync } from "node:fs";
import { loadEnv } from "./env.mjs";
loadEnv();
const BASE = process.argv[2] || "https://ielts-platform-dev.vercel.app";
const OUT = "public/friends";
mkdirSync(OUT, { recursive: true });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const stamp = Date.now();
const users = [];
const testIds = [];
const rpc = async (fn, args) => {
  const { data, error } = await admin.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data;
};

async function mkUser(name, extra) {
  const email = `e2e-shot-${name.toLowerCase()}-${stamp}@example.com`;
  const password = "Shot-" + Math.random().toString(36).slice(2) + "A1!";
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name } });
  if (error) throw error;
  const u = { id: data.user.id, email, password, name };
  users.push(u);
  await admin.from("profiles").update({ name, ...extra }).eq("id", u.id);
  return u;
}

const day = (offset) => new Date(Date.now() - offset * 86400_000).toISOString().slice(0, 10);
const now = new Date();
const weekStart = (() => {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d;
})();
// A moment this week, `hoursAgo` before now but never before Monday 00:00 UTC.
const thisWeek = (hoursAgo) => new Date(Math.max(weekStart.getTime() + 3600_000, Date.now() - hoursAgo * 3600_000)).toISOString();

const browser = await chromium.launch({ channel: "msedge" });
try {
  // ------------------------------------------------------------ people
  const aziz = await mkUser("Aziz", { rating: 1540, peak_rating: 1560, rated_count: 24, listening_rating: 1390, listening_peak: 1400, listening_rated_count: 9, streak: 6, last_activity_date: day(0), xp: 1240 });
  const madina = await mkUser("Madina", { rating: 1610, peak_rating: 1620, rated_count: 31, listening_rating: 1455, listening_peak: 1460, listening_rated_count: 14, streak: 11, last_activity_date: day(0), xp: 1880 });
  const jasur = await mkUser("Jasur", { rating: 1310, peak_rating: 1330, rated_count: 12, streak: 2, last_activity_date: day(1), xp: 540 });
  const laylo = await mkUser("Laylo", { rating: 1180, peak_rating: 1200, rated_count: 5, streak: 0, xp: 210 });

  // ------------------------------------------------------------ group
  const g = (await rpc("friends_extend", { p_owner: aziz.id, p_months: 3, p_by: null })) ;
  const group = Array.isArray(g) ? g[0] : g;
  await rpc("friends_rename", { p_actor: aziz.id, p_group: group.id, p_name: "Band 7 Club" });
  for (const m of [madina, jasur]) await rpc("friends_join", { p_user: m.id, p_code: group.invite_code });
  await rpc("friends_invite", { p_owner: aziz.id, p_invitee: laylo.id });
  // Everyone joined on Monday, so this week's tests count as "since joining"
  // (no Remove buttons) and appear in the feed.
  const monday = new Date(weekStart.getTime() + 30 * 60_000).toISOString();
  await admin.from("premium_group_members").update({ joined_at: monday }).eq("group_id", group.id);
  await admin.from("premium_groups").update({ created_at: monday }).eq("id", group.id);
  // No "Congratulations" popup in the shots; streaks/ratings set above survive the joins.
  await admin.from("profiles").update({ premium_announce: false }).in("id", users.map((u) => u.id));

  // ------------------------------------------------------------ tests + results (this week)
  const titles = [
    ["The History of Tea", "reading"],
    ["Coral Reefs Under Threat", "reading"],
    ["Urban Beekeeping", "reading"],
    ["The Secret Life of Octopuses", "reading"],
    ["City Museum Tour", "listening"],
    ["Booking a Language Course", "listening"],
  ];
  const tests = [];
  for (const [title, skill] of titles) {
    const { data, error } = await admin.from("tests").insert({
      title, skill, kind: "single", tier: "free", track: "pre_ielts",
      file_path: `e2e/shot-${stamp}-${tests.length}.html`, file_url: `https://example.com/e2e/shot-${stamp}-${tests.length}.html`,
      total: skill === "listening" ? 40 : 13, question_types: [], answer_key: { 1: ["a"] },
    }).select("id").single();
    if (error) throw error;
    tests.push({ id: data.id, title, skill });
    testIds.push(data.id);
  }
  // [who, test index, raw, band, points, hours ago]
  const plan = [
    [madina, 0, 11, 7.5, 92, 2], [aziz, 4, 33, 7.5, 88, 3], [madina, 4, 35, 8.0, 101, 5],
    [aziz, 1, 10, 7.0, 81, 7], [madina, 1, 12, 8.0, 104, 20], [aziz, 0, 9, 6.5, 70, 26],
    [jasur, 2, 8, 6.0, 58, 30], [madina, 2, 11, 7.5, 90, 44], [aziz, 2, 10, 7.0, 79, 50],
    [jasur, 0, 7, 5.5, 45, 54], [madina, 3, 12, 8.0, 99, 60], [aziz, 5, 31, 7.0, 76, 70],
  ];
  for (const [u, ti, raw, band, points, h] of plan) {
    const t = tests[ti];
    const { error } = await admin.from("results").insert({
      user_id: u.id, test_id: t.id, skill: t.skill, raw, total: t.skill === "listening" ? 40 : 13, band,
      duration_seconds: 900, rated: true, points, submitted_at: thisWeek(h),
    });
    if (error) throw error;
  }

  // ------------------------------------------------------------ shots
  const contexts = [];
  const login = async (u) => {
    // One browser context per person, so each has their own session cookie.
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2, colorScheme: "light" });
    contexts.push(ctx);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/login`);
    await page.waitForLoadState("networkidle");
    await page.fill('input[type="email"]', u.email);
    await page.fill('input[type="password"]', u.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/dashboard/, { timeout: 30000 });
    await page.evaluate(() => localStorage.setItem("theme", "light"));
    return page;
  };
  const go = async (p, path) => {
    await p.goto(`${BASE}${path}`);
    await p.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(400);
  };
  const shotEl = async (loc, name) => {
    await loc.scrollIntoViewIfNeeded();
    await loc.screenshot({ path: `${OUT}/${name}.jpg`, type: "jpeg", quality: 88 });
    console.log("saved", `${OUT}/${name}.jpg`);
  };
  const shotUnion = async (p, locs, name, pad = 0) => {
    const boxes = [];
    for (const l of locs) { await l.scrollIntoViewIfNeeded(); boxes.push(await l.boundingBox()); }
    // boundingBox is relative to the viewport; take a full-page shot clipped to the union.
    const scroll = await p.evaluate(() => window.scrollY);
    const x = Math.min(...boxes.map((b) => b.x)) - pad, y = Math.min(...boxes.map((b) => b.y)) + scroll - pad;
    const r = Math.max(...boxes.map((b) => b.x + b.width)) + pad, btm = Math.max(...boxes.map((b) => b.y + b.height)) + scroll + pad;
    await p.screenshot({ path: `${OUT}/${name}.jpg`, type: "jpeg", quality: 88, fullPage: true, clip: { x, y, width: r - x, height: btm - y } });
    console.log("saved", `${OUT}/${name}.jpg`);
  };

  const ap = await login(aziz);
  await go(ap, "/premium/group");
  await shotEl(ap.locator('section[aria-label="Seats"]'), "invite");
  await shotEl(ap.locator('section[aria-label="Friends"]'), "friends");
  await shotUnion(ap, [ap.locator('section[aria-label="Weekly goal"]'), ap.locator('section[aria-label="Group activity"]')], "goal-feed");

  // Leaderboard: a narrower window, cropped to the switch + the demo group's row only.
  await ap.setViewportSize({ width: 820, height: 1000 });
  await go(ap, "/leaderboard");
  await ap.getByRole("button", { name: "Groups", exact: true }).click();
  await ap.waitForTimeout(300);
  const board = ap.locator('[data-board="groups"]');
  await shotUnion(ap, [board.locator('[role="group"]'), board.locator("li", { hasText: "Band 7 Club" })], "leaderboard", 6);

  const lp = await login(laylo);
  await go(lp, "/dashboard");
  await shotEl(lp.locator('section[aria-label="Group invitation"]'), "accept");
  for (const c of contexts) await c.close();
} finally {
  await browser.close();
  const ids = users.map((u) => u.id);
  if (ids.length) await admin.from("results").delete().in("user_id", ids);
  if (testIds.length) await admin.from("tests").delete().in("id", testIds);
  for (const u of users) await admin.auth.admin.deleteUser(u.id);
  console.log(`cleanup done (${users.length} users + ${testIds.length} tests deleted)`);
}
