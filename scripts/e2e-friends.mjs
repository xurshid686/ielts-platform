// E2E (2026-11-27) for the Friends plan (0077): admin creates a group, the
// organiser's page shows the invite link, 3 friends join through /join/<code>,
// all get Premium, a 5th is refused, the dashboard card and /premium card show.
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

async function mkUser(tag, role) {
  const email = `e2e-fr-${tag}-${stamp}@example.com`, password = "E2e-" + Math.random().toString(36).slice(2) + "A1!";
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: `E2E ${tag}` } });
  if (error) throw error;
  await admin.from("profiles").update({ name: `E2E ${tag}`, ...(role ? { role } : {}) }).eq("id", data.user.id);
  const u = { id: data.user.id, email, password, tag };
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
const premiumUntil = async (id) => (await admin.from("profiles").select("premium_until").eq("id", id).single()).data.premium_until;

const browser = await chromium.launch({ channel: "msedge" });
try {
  const boss = await mkUser("admin", "admin");
  const org = await mkUser("organiser");
  const friends = [await mkUser("friend1"), await mkUser("friend2"), await mkUser("friend3")];
  const fifth = await mkUser("friend4");

  // ------------------------------------------------ /premium shows the Friends card (guest)
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/premium`); await p.waitForLoadState("networkidle");
    const card = p.locator('[data-plan="friends"]');
    check(await card.isVisible(), "/premium shows the Friends card");
    check((await card.innerText()).includes("150"), "3-month Friends price is 150 000");
    check((await card.innerText()).includes("37"), "per-person price shown");
    await shot(p, "premium-light-1440");
    await ctx.close();
  }

  // ------------------------------------------------ admin creates the group on Student 360
  const ap = await login(browser, boss);
  await ap.goto(`${BASE}/admin/members/${org.id}`); await ap.waitForLoadState("networkidle");
  await ap.selectOption('select[aria-label="Friends period"]', "3");
  await ap.getByRole("button", { name: "Create group" }).click();
  await ap.waitForFunction(() => /Friends group runs until/.test(document.body.innerText), null, { timeout: 30000 });
  const { data: g } = await admin.from("premium_groups").select("id, invite_code, expires_at").eq("owner_id", org.id).single();
  check(!!g?.invite_code, `group created (code ${g?.invite_code})`);
  check(new Date(await premiumUntil(org.id)) >= new Date(g.expires_at) - 1000, "organiser has Premium to the group end");

  // ------------------------------------------------ organiser's page shows the link
  const op = await login(browser, org);
  await op.goto(`${BASE}/premium/group`); await op.waitForLoadState("networkidle");
  const link = await op.inputValue('input[aria-label="Invite link"]');
  check(link.endsWith(`/join/${g.invite_code}`), "organiser sees the invite link");
  check((await op.locator("body").innerText()).includes("1 of 4 seats used"), "seat count shown (1 of 4)");

  // ------------------------------------------------ guest sees sign-up with next=
  {
    const ctx = await browser.newContext(); const p = await ctx.newPage();
    await p.goto(`${BASE}/join/${g.invite_code}`); await p.waitForLoadState("networkidle");
    const t = await p.locator("body").innerText();
    check(/E2E invited you/.test(t) && t.includes("3 of 4 seats left"), "guest sees the invite + seats left");
    const href = await p.getByRole("link", { name: /Create a free account/ }).getAttribute("href");
    check(href.includes(`next=${encodeURIComponent(`/join/${g.invite_code}`)}`), "sign-up link returns to the invite");
    await shot(p, "join-guest");
    await ctx.close();
  }

  // ------------------------------------------------ 3 friends join
  for (const f of friends) {
    const p = await login(browser, f);
    await p.goto(`${BASE}/join/${g.invite_code.toLowerCase()}`); await p.waitForLoadState("networkidle");
    await p.locator("button[data-join]").click();
    await p.waitForURL(/premium\/group\?joined=1/, { timeout: 30000 });
    check((await p.locator("body").innerText()).includes("You're in!"), `${f.tag} joined`);
    check(new Date(await premiumUntil(f.id)) >= new Date(g.expires_at) - 1000, `${f.tag} has Premium to the group end`);
    if (f === friends[2]) {
      await p.goto(`${BASE}/dashboard`); await p.waitForLoadState("networkidle");
      check(await p.locator('section[aria-label="My Friends group"]').isVisible(), "dashboard shows the My group card");
      await shot(p, "dashboard-member");
    }
    await p.context().close();
  }

  // ------------------------------------------------ the 5th is refused
  {
    const p = await login(browser, fifth);
    await p.goto(`${BASE}/join/${g.invite_code}`); await p.waitForLoadState("networkidle");
    const t = await p.locator("body").innerText();
    check(t.includes("0 of 4 seats left") && (await p.locator("button[data-join]").count()) === 0, "5th friend can't join a full group");
    check(!(await premiumUntil(fifth.id)), "5th friend got no Premium");
    await p.context().close();
  }

  // ------------------------------------------------ organiser page + admin remove
  await op.goto(`${BASE}/premium/group`); await op.waitForLoadState("networkidle");
  check((await op.locator("body").innerText()).includes("4 of 4 seats used"), "organiser sees 4 of 4");
  await shot(op, "group-organiser");
  await op.evaluate(() => localStorage.setItem("theme", "dark"));
  await op.reload(); await op.waitForLoadState("networkidle"); await shot(op, "group-organiser-dark");

  await ap.reload(); await ap.waitForLoadState("networkidle");
  ap.once("dialog", (d) => d.accept());
  await ap.getByRole("button", { name: "Remove" }).first().click();
  await ap.waitForFunction(() => /Removed from the group/.test(document.body.innerText), null, { timeout: 30000 });
  const { count } = await admin.from("premium_group_members").select("user_id", { count: "exact", head: true }).eq("group_id", g.id);
  check(count === 3, "admin remove frees a seat (3 left in group)");
  await shot(ap, "admin-360-friends");
} finally {
  await browser.close();
  // Members cascade with the group; the group cascades with the organiser's profile.
  for (const u of users) await admin.auth.admin.deleteUser(u.id);
  console.log(`cleanup done (${users.length} users deleted)`);
}
console.log(fails.length ? `\n${fails.length} FAILED` : "\nALL PASSED");
process.exit(fails.length ? 1 : 0);
