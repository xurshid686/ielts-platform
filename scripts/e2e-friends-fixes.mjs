// E2E (2026-11-28) for the Friends review fixes:
//   1  the group feed shows a member's tests only from when they joined
//   6  the join page gives every state a next step (seat saved for an invitee, other group, full, ended)
//   7  the dashboard group card of an ended group says "Open group", not "Invite friends"
// (2, the invite search for buyers only, is server-side; 8 is checked by scripts/check-0080.mjs.)
// Throwaway users and pre_ielts throwaway tests (a results insert bumps times_done) are DELETED in `finally`.
// Usage: node scripts/e2e-friends-fixes.mjs [baseUrl]
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./env.mjs";
loadEnv();
const BASE = (process.argv[2] || "https://ielts-platform-dev.vercel.app").replace(/\/+$/, "");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const fails = [];
const check = (ok, label) => { console.log(ok ? "✓" : "✗", label); if (!ok) fails.push(label); };
const stamp = Date.now();
const users = [];
const testIds = [];
const ago = (days) => new Date(Date.now() - days * 86400000).toISOString();

async function mkUser(tag, role) {
  const email = `e2e-fx-${tag}-${stamp}@example.com`, password = "E2e-" + Math.random().toString(36).slice(2) + "A1!";
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: `Fx ${tag}` } });
  if (error) throw error;
  await admin.from("profiles").update({ name: `Fx ${tag} ${stamp % 10000}`, ...(role ? { role } : {}) }).eq("id", data.user.id);
  const u = { id: data.user.id, email, password, tag };
  users.push(u);
  return u;
}
async function mkTest(label) {
  const { data, error } = await admin.from("tests").insert({
    title: `E2E fx ${stamp} ${label}`, skill: "reading", kind: "single", tier: "free", track: "pre_ielts",
    file_path: `e2e/fx-${stamp}-${label}.html`, file_url: `https://example.com/e2e/fx-${stamp}-${label}.html`, total: 13,
    question_types: [], answer_key: { 1: ["a"] },
  }).select("id, title").single();
  if (error) throw error;
  testIds.push(data.id);
  return data;
}
async function group(boss, owner) {
  const { error } = await admin.rpc("admin_friends_extend_as", { p_actor: boss.id, p_owner: owner.id, p_months: 1 });
  if (error) throw new Error("extend: " + error.message);
  const { data } = await admin.from("premium_groups").select("id, invite_code").eq("owner_id", owner.id).single();
  return data;
}
async function login(browser, u) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`); await page.waitForLoadState("networkidle", { timeout: 60000 });
  await page.fill('input[type="email"]', u.email); await page.fill('input[type="password"]', u.password);
  await page.click('button[type="submit"]'); await page.waitForURL(/dashboard/, { timeout: 30000 });
  return page;
}
const goto = async (p, path) => {
  await p.goto(`${BASE}${path}`);
  await p.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  const b = p.getByRole("button", { name: /Let.s go/ }); // the one-time Premium welcome popup
  if (await b.isVisible().catch(() => false)) { await b.click(); await p.waitForTimeout(300); }
};
const mainText = (p) => p.evaluate(() => (document.querySelector("main") ?? document.body).innerText);

const browser = await chromium.launch({ channel: "msedge" });
try {
  const boss = await mkUser("admin", "admin");
  const A = await mkUser("buyer");
  const B = await mkUser("joiner");
  const C = await mkUser("invitee");
  const H = await mkUser("invitee2");
  const E = await mkUser("otherbuyer");
  const D = await mkUser("othermember");
  const F = await mkUser("endedbuyer");
  const G = await mkUser("outsider");

  // ------------------------------------------------ 1. feed: own history from joining only
  const gA = await group(boss, A);
  // The group (and its buyer) date from 5 days ago, so the feed's old cut-off would have reached back.
  await admin.from("premium_groups").update({ created_at: ago(5) }).eq("id", gA.id);
  await admin.from("premium_group_members").update({ joined_at: ago(5) }).eq("group_id", gA.id).eq("user_id", A.id);
  const oldT = await mkTest("before-joining");
  const newT = await mkTest("after-joining");
  await admin.from("results").insert({ user_id: B.id, test_id: oldT.id, skill: "reading", raw: 3, total: 13, band: 3.5, submitted_at: ago(2) });
  const { data: joined } = await admin.rpc("friends_join", { p_user: B.id, p_code: gA.invite_code });
  check(joined === "joined", "B joins A's group by link");
  await admin.from("results").insert({ user_id: B.id, test_id: newT.id, skill: "reading", raw: 10, total: 13, band: 7, submitted_at: new Date().toISOString() });
  {
    const p = await login(browser, A);
    await goto(p, "/premium/group");
    const feed = await p.locator('section[aria-label="Group activity"]').innerText();
    check(feed.includes(newT.title), "feed shows B's test taken after joining");
    check(!feed.includes(oldT.title), "feed hides B's test from before joining (fix 1)");
    await p.context().close();
  }

  // ------------------------------------------------ 6a. a seat saved for an invitee
  for (const who of [C, H]) {
    const { data } = await admin.rpc("friends_invite", { p_owner: A.id, p_invitee: who.id });
    check(data === "invited", `A invites ${who.tag}`);
  }
  // A, B + two pending invitations = 4 of 4: the link shows 0 seats to everyone else.
  {
    const p = await login(browser, C);
    await goto(p, `/join/${gA.invite_code}`);
    const t = await mainText(p);
    check(t.includes("A seat is saved for you"), "invitee sees 'A seat is saved for you' (fix 6)");
    const join = p.locator("button[data-join]");
    check(await join.isVisible(), "invitee gets the Join button although the other seats are reserved (fix 6)");
    await join.click();
    await p.waitForURL(/\/premium\/group/, { timeout: 30000 }).catch(() => {});
    const { data: m } = await admin.from("premium_group_members").select("group_id").eq("user_id", C.id).maybeSingle();
    check(m?.group_id === gA.id, "invitee joined through the link");
    await p.context().close();
  }
  {
    const p = await login(browser, G);
    await goto(p, `/join/${gA.invite_code}`);
    check(await p.locator('[data-join-state="full"]').isVisible(), "outsider sees 'full' with a way on, not a dead card (fix 6)");
    check(!(await p.locator("button[data-join]").count()), "outsider gets no Join button on a full group");
    await p.context().close();
  }

  // ------------------------------------------------ 6b. a member of another group
  const gE = await group(boss, E);
  const { data: dj } = await admin.rpc("friends_join", { p_user: D.id, p_code: gE.invite_code });
  check(dj === "joined", "D is in E's group");
  {
    const p = await login(browser, D);
    await goto(p, `/join/${gA.invite_code}`);
    const st = p.locator('[data-join-state="other-group"]');
    check(await st.isVisible(), "member of another group is told so (fix 6)");
    check(await st.getByRole("link", { name: "Open my group" }).isVisible(), "…with a link to their own group");
    check(!(await p.locator("button[data-join]").count()), "…and no Join button that could only fail");
    await p.context().close();
  }

  // ------------------------------------------------ 6c + 7. an ended group
  const gF = await group(boss, F);
  await admin.from("premium_groups").update({ expires_at: ago(1) }).eq("id", gF.id);
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    const p = await ctx.newPage();
    await goto(p, `/join/${gF.invite_code}`);
    check(await p.locator('[data-join-state="ended"]').isVisible(), "guest on an ended group sees 'See Premium plans' (fix 6)");
    check(!(await p.getByRole("link", { name: /Create a free account to join/ }).count()), "…and is not asked to sign up for it");
    await ctx.close();
  }
  {
    const p = await login(browser, G);
    await goto(p, `/join/${gF.invite_code}`);
    check(await p.locator('[data-join-state="ended"]').isVisible(), "signed-in visitor on an ended group sees a next step (fix 6)");
    await p.context().close();
  }
  {
    const p = await login(browser, F);
    await goto(p, "/dashboard");
    const card = p.locator('section[aria-label="My Friends group"]');
    await card.waitFor({ timeout: 20000 }).catch(() => {});
    const t = await card.innerText().catch(() => "");
    check(/ended/i.test(t) && t.includes("Open group") && !t.includes("Invite friends"), "dashboard card of an ended group: 'ended' + 'Open group' (fix 7)");
    await p.context().close();
  }
} finally {
  await browser.close();
  const ids = users.map((u) => u.id);
  if (ids.length) await admin.from("results").delete().in("user_id", ids);
  if (testIds.length) await admin.from("tests").delete().in("id", testIds);
  for (const u of users) await admin.auth.admin.deleteUser(u.id); // groups cascade with their buyer
  console.log(`cleanup done (${users.length} users + ${testIds.length} throwaway tests deleted)`);
}
console.log(fails.length ? `\n${fails.length} FAILED` : "\nALL PASSED");
process.exit(fails.length ? 1 : 0);
