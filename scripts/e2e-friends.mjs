// E2E (2026-11-27) for the Friends plan v1 + v2 (0077 + 0078): admin creates a
// group, the buyer renames it and invites by email; invitations are accepted,
// declined, cancelled and expired; link join; remove-inactive; nudge; weekly
// goal (+100 XP once); leave restores Premium; Groups leaderboard; admin hide,
// change buyer and the groups page; public profile; overview strip.
// Throwaway users are created with the service role and DELETED in `finally`.
// Usage: node scripts/e2e-friends.mjs [baseUrl] [shotDir]
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
const users = [];
const testIds = [];

async function mkUser(tag, role) {
  const email = `e2e-fr-${tag}-${stamp}@example.com`, password = "E2e-" + Math.random().toString(36).slice(2) + "A1!";
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: `E2E ${tag}` } });
  if (error) throw error;
  await admin.from("profiles").update({ name: `E2E ${tag} ${stamp % 10000}`, ...(role ? { role } : {}) }).eq("id", data.user.id);
  const u = { id: data.user.id, email, password, tag, name: `E2E ${tag} ${stamp % 10000}` };
  users.push(u);
  return u;
}
async function login(browser, u, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, ...opts });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`); await page.waitForLoadState("networkidle", { timeout: 60000 });
  await page.fill('input[type="email"]', u.email); await page.fill('input[type="password"]', u.password);
  await page.click('button[type="submit"]'); await page.waitForURL(/dashboard/, { timeout: 30000 });
  return page;
}
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }); };
const body = (p) => p.locator("body").innerText();
const waitText = (p, re, timeout = 20000) =>
  p.waitForFunction((s) => new RegExp(s).test(document.body.innerText), re.source, { timeout }).then(() => true, () => false);
const premiumUntil = async (id) => (await admin.from("profiles").select("premium_until").eq("id", id).single()).data.premium_until;
const isPremium = async (id) => { const u = await premiumUntil(id); return !!u && new Date(u) > new Date(Date.now() + 60_000); };
// The one-time "Congratulations, you're Premium" popup (premium_announce) covers the page: close it like a student would.
const dismissWelcome = async (p) => {
  const b = p.getByRole("button", { name: /Let.s go/ });
  if (await b.isVisible().catch(() => false)) { await b.click(); await p.waitForTimeout(300); }
};
const goto = async (p, path) => {
  await p.goto(`${BASE}${path}`);
  await p.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await dismissWelcome(p);
};

const browser = await chromium.launch({ channel: "msedge" });
try {
  const boss = await mkUser("admin", "admin");
  const buyer = await mkUser("buyer");
  const [f1, f2, f3, f4, f5] = [await mkUser("f1"), await mkUser("f2"), await mkUser("f3"), await mkUser("f4"), await mkUser("f5")];

  // ------------------------------------------------ /premium shows the Friends card (guest)
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await ctx.newPage();
    await goto(p, "/premium");
    const card = p.locator('[data-plan="friends"]');
    check(await card.isVisible(), "/premium shows the Friends card");
    check((await card.innerText()).includes("150"), "3-month Friends price is 150 000");
    // Owner, 2026-11-27: clicking the plan opens its guide page.
    await p.locator("[data-friends-guide]").click();
    await p.waitForURL(/\/premium\/friends$/, { timeout: 20000 });
    await p.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    check((await p.locator("[data-step]").count()) === 5, "guide page shows 5 steps");
    const imgs = await p.locator("main img, img[alt]").evaluateAll((els) =>
      els.filter((e) => e.getAttribute("src")?.includes("friends")).map((e) => ({ ok: e.complete && e.naturalWidth > 0, src: e.getAttribute("src") })));
    for (const im of imgs) im.ok || (await p.locator(`img[src="${im.src}"]`).scrollIntoViewIfNeeded(), await p.waitForTimeout(800));
    const loaded = await p.locator("img").evaluateAll((els) => els.filter((e) => (e.getAttribute("src") ?? "").includes("friends")).map((e) => e.complete && e.naturalWidth > 0));
    check(loaded.length === 5 && loaded.every(Boolean), `guide screenshots load (${loaded.filter(Boolean).length}/5)`);
    await p.locator('button[data-buy="friends"]').first().click();
    await p.waitForURL(/\/login\?next=/, { timeout: 20000 });
    check(decodeURIComponent(p.url()).includes("/premium/friends?buy=friends&months=3"), "guest Get Friends -> sign in, returns to the guide");
    await ctx.close();
  }

  // ------------------------------------------------ admin creates the group (Student 360)
  const ap = await login(browser, boss);
  await goto(ap, `/admin/members/${buyer.id}`);
  await ap.selectOption('select[aria-label="Friends period"]', "3");
  await ap.getByRole("button", { name: "Create group" }).click();
  check(await waitText(ap, /Friends group runs until/, 30000), "admin creates a group");
  const { data: g } = await admin.from("premium_groups").select("id, invite_code, expires_at").eq("owner_id", buyer.id).single();

  // ------------------------------------------------ buyer renames
  const bp = await login(browser, buyer);
  await goto(bp, "/premium/group");
  check((await body(bp)).includes("0 of 3 invitations accepted"), "seats meter starts at 0 of 3");
  await bp.getByRole("button", { name: "Rename group" }).click();
  await bp.fill('input[aria-label="Group name"]', "f u c k crew");
  await bp.getByRole("button", { name: "Save" }).click();
  check(await waitText(bp, /choose a different name/), "rude group name refused");
  const groupName = `E2E Tigers ${stamp % 10000}`;
  await bp.fill('input[aria-label="Group name"]', groupName);
  await bp.getByRole("button", { name: "Save" }).click();
  await waitText(bp, new RegExp(groupName));
  check((await admin.from("premium_groups").select("name").eq("id", g.id).single()).data.name === groupName, "buyer renames the group");

  // ------------------------------------------------ invite by email
  const invite = async (u) => {
    await bp.fill('input[aria-label="Find a friend to invite"]', u.email);
    const btn = bp.locator(`button[data-invite="${u.id}"]`);
    await btn.waitFor({ timeout: 15000 });
    await btn.click();
    return waitText(bp, /Invitation sent/);
  };
  check(await invite(f1), "buyer invites f1 by email search");
  await goto(bp, "/premium/group");
  check(/0 of 3 invitations accepted/.test(await body(bp)) && /1 pending/.test(await body(bp)), "meter shows 1 pending");
  const { count: bell } = await admin.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", f1.id).eq("type", "friends_invite");
  check(bell === 1, "f1 got a bell notification");

  // f1 accepts from the dashboard banner
  const p1 = await login(browser, f1);
  await goto(p1, "/dashboard");
  check(await p1.locator('section[aria-label="Group invitation"]').isVisible(), "f1 sees the invitation banner on the dashboard");
  await shot(p1, "dashboard-invite-banner");
  await p1.locator("button[data-accept]").first().click();
  await p1.waitForURL(/premium\/group\?joined=1/, { timeout: 30000 });
  check(await waitText(p1, /You.re in!/), "f1 accepted and sees the group");
  check(await isPremium(f1.id), "f1 has Premium");

  // f2 declines on the invitations page
  check(await invite(f2), "buyer invites f2");
  const p2 = await login(browser, f2);
  await goto(p2, "/premium/group/invites");
  check((await body(p2)).includes(groupName), "f2 sees the invitation with the group name");
  await p2.locator("button[data-decline]").first().click();
  check(await waitText(p2, /Invitation declined/), "f2 declines");
  check(!(await isPremium(f2.id)), "f2 got no Premium");
  // The guide's buy button opens the Telegram-only payment window for a signed-in student.
  await goto(p2, "/premium/friends?buy=friends&months=3");
  const dlg = p2.getByRole("dialog");
  check(await dlg.isVisible().catch(() => false) || (await dlg.waitFor({ timeout: 10000 }).then(() => true, () => false)), "?buy=friends reopens the payment window");
  const methods = await dlg.locator("[data-method]").evaluateAll((els) => els.map((e) => e.getAttribute("data-method")));
  check(JSON.stringify(methods) === '["telegram"]' && (await dlg.innerText()).includes("150"), "Friends payment window: Telegram only, 150 000");

  // buyer invites f3, then cancels
  check(await invite(f3), "buyer invites f3");
  await goto(bp, "/premium/group");
  await bp.locator("li", { hasText: f3.name }).getByRole("button", { name: "Cancel" }).click();
  await bp.locator("li", { hasText: f3.name }).waitFor({ state: "detached", timeout: 20000 }).catch(() => {});
  check((await admin.from("premium_group_invites").select("status").eq("group_id", g.id).eq("invitee_id", f3.id).single()).data.status === "cancelled", "buyer cancels f3's invitation");

  // f4 joins by link
  const p4 = await login(browser, f4);
  await goto(p4, `/join/${g.invite_code}`);
  await p4.locator("button[data-join]").click();
  await p4.waitForURL(/premium\/group\?joined=1/, { timeout: 30000 });
  check(await isPremium(f4.id), "f4 joins by link and has Premium");

  // f5 invited -> seats full (buyer, f1, f4 + pending f5)
  check(await invite(f5), "buyer invites f5 (last seat)");
  {
    const ctx = await browser.newContext(); const p = await ctx.newPage();
    await goto(p, `/join/${g.invite_code}`);
    check((await body(p)).includes("0 of 4 seats left"), "a pending invitation holds the last seat");
    await admin.from("premium_group_invites").update({ expires_at: new Date(Date.now() - 60_000).toISOString() }).eq("group_id", g.id).eq("invitee_id", f5.id);
    await goto(p, `/join/${g.invite_code}`);
    check((await body(p)).includes("1 of 4 seats left"), "an expired invitation frees its seat");
    await ctx.close();
  }

  // ------------------------------------------------ remove-inactive, nudge
  // Throwaway tests (pre_ielts: never in the public catalogue): a results insert
  // bumps tests.times_done with no decrement, so real papers must not be used.
  const tests = [];
  for (let i = 0; i < 10; i++) {
    const { data, error } = await admin.from("tests").insert({
      title: `E2E friends ${stamp} #${i}`, skill: "reading", kind: "single", tier: "free", track: "pre_ielts",
      file_path: `e2e/${stamp}-${i}.html`, file_url: `https://example.com/e2e/${stamp}-${i}.html`, total: 13,
      question_types: [], answer_key: { 1: ["a"] },
    }).select("id").single();
    if (error) throw error;
    tests.push(data);
    testIds.push(data.id);
  }
  const addResult = (u, i) =>
    admin.from("results").insert({ user_id: u.id, test_id: tests[i].id, skill: "reading", raw: 6, total: 13, band: 5.5, submitted_at: new Date().toISOString() });
  await addResult(f1, 0); // f1 is now active
  await goto(bp, "/premium/group");
  check((await bp.locator("li", { hasText: f1.name }).getByRole("button", { name: "Remove" }).count()) === 0, "active f1 can't be removed");
  bp.once("dialog", (d) => d.accept());
  await bp.locator("li", { hasText: f4.name }).getByRole("button", { name: "Remove" }).click();
  check(await waitText(bp, /Removed\. The seat is free/), "buyer removes inactive f4");
  check(!(await isPremium(f4.id)), "removed f4's group Premium ended");

  await goto(p1, "/premium/group");
  await p1.locator("li", { hasText: buyer.name }).getByRole("button", { name: "Nudge" }).click();
  check(await waitText(p1, /Nudge sent!/), "f1 nudges the buyer");
  await goto(p1, "/premium/group");
  await p1.locator("li", { hasText: buyer.name }).getByRole("button", { name: "Nudge" }).click();
  check(await waitText(p1, /already nudged/), "second nudge the same day is refused");

  // ------------------------------------------------ weekly goal (buyer + f1 = 10 tests)
  for (let i = 1; i < 10; i++) await addResult(i % 2 ? buyer : f1, i);
  const xp0 = (await admin.from("profiles").select("xp").eq("id", f1.id).single()).data.xp;
  const r1 = await admin.rpc("friends_goal_check", { p_user: f1.id });
  const r2 = await admin.rpc("friends_goal_check", { p_user: f1.id });
  const xp1 = (await admin.from("profiles").select("xp").eq("id", f1.id).single()).data.xp;
  check(r1.data === "reached" && r2.data === "already" && xp1 - xp0 === 100, `goal reached once, +100 XP (${r1.data}/${r2.data}, +${xp1 - xp0})`);
  await goto(bp, "/premium/group");
  check((await body(bp)).includes("Goal reached"), "group page shows the goal reached");
  await shot(bp, "group-buyer-light");

  // ------------------------------------------------ renewal banner talks about the group
  {
    const soon = new Date(Date.now() + 2 * 86400_000).toISOString();
    await admin.from("premium_groups").update({ expires_at: soon }).eq("id", g.id);
    await admin.from("profiles").update({ premium_until: soon }).in("id", [buyer.id, f1.id]);
    await goto(bp, "/dashboard");
    check((await bp.locator('[data-renew="group-buyer"]').count()) === 1 && (await body(bp)).includes(`${groupName} ends in`), "buyer's renewal banner: renew the group");
    await goto(p1, "/dashboard");
    check((await p1.locator('[data-renew="group-member"]').count()) === 1 && (await body(p1)).includes("renew the group"), "member's renewal banner: ask the buyer");
    await shot(p1, "renewal-member");
  }

  // ------------------------------------------------ profile + leaderboard
  await goto(bp, `/u/${f1.id}`);
  check((await body(bp)).includes("In your Friends group"), "friend's profile shows the shared group");
  check((await body(bp)).includes("Day streak") && (await body(bp)).includes("Points this week"), "profile shows streak and weekly points");

  await goto(p1, "/leaderboard");
  await p1.getByRole("button", { name: "Groups" }).click();
  await p1.getByRole("button", { name: "Average rating" }).click();
  check((await body(p1)).includes(groupName), "group appears on the Groups leaderboard");
  await shot(p1, "leaderboard-groups");

  // ------------------------------------------------ admin groups page: hide, change buyer
  await goto(ap, "/admin/groups");
  const panel = ap.locator("section", { has: ap.locator(`[data-group="${g.id}"]`) });
  check(await panel.isVisible(), "admin groups page lists the group");
  await panel.getByRole("button", { name: "Hide from leaderboard" }).click();
  await waitText(ap, /Hidden from the group leaderboard/);
  await goto(p1, "/leaderboard");
  await p1.getByRole("button", { name: "Groups" }).click();
  await p1.getByRole("button", { name: "Average rating" }).click();
  check(!(await body(p1)).includes(groupName), "hidden group disappears from the leaderboard");
  await goto(ap, "/admin/groups");
  await panel.locator('select[aria-label="Member"]').selectOption(f1.id);
  ap.once("dialog", (d) => d.accept());
  await panel.getByRole("button", { name: "Make buyer" }).click();
  await waitText(ap, /Buyer changed/);
  check((await admin.from("premium_groups").select("owner_id").eq("id", g.id).single()).data.owner_id === f1.id, "admin changes the buyer");
  await admin.from("premium_groups").update({ owner_id: buyer.id }).eq("id", g.id);
  await shot(ap, "admin-groups");

  await goto(ap, "/admin");
  check((await body(ap)).includes("Friends plan") && (await body(ap)).includes("active groups"), "admin overview shows the Friends strip");

  // ------------------------------------------------ f1 leaves -> Premium back to before (none)
  await goto(p1, "/premium/group");
  p1.once("dialog", (d) => d.accept());
  await p1.getByRole("button", { name: "Leave group" }).click();
  check(await waitText(p1, /You left the group/), "f1 leaves the group");
  check(!(await isPremium(f1.id)), "leaving ends the group Premium");

  // dark + phone screenshots
  if (SHOTS) {
    const dctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark" });
    const dp = await dctx.newPage();
    await dp.goto(`${BASE}/login`); await dp.waitForLoadState("networkidle");
    await dp.fill('input[type="email"]', buyer.email); await dp.fill('input[type="password"]', buyer.password);
    await dp.click('button[type="submit"]'); await dp.waitForURL(/dashboard/, { timeout: 30000 });
    await dp.evaluate(() => localStorage.setItem("theme", "dark"));
    await goto(dp, "/premium/group"); await shot(dp, "group-buyer-dark-phone");
    await dctx.close();
  }
} finally {
  await browser.close();
  const ids = users.map((u) => u.id);
  if (ids.length) await admin.from("results").delete().in("user_id", ids);
  if (testIds.length) await admin.from("tests").delete().in("id", testIds);
  // Groups cascade with the buyer's profile; members and invitations with the group.
  for (const u of users) await admin.auth.admin.deleteUser(u.id);
  console.log(`cleanup done (${users.length} users + ${testIds.length} throwaway tests deleted)`);
}
console.log(fails.length ? `\n${fails.length} FAILED` : "\nALL PASSED");
process.exit(fails.length ? 1 : 0);
