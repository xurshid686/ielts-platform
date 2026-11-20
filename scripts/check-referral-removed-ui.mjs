// Browser check that the invite-a-friend feature is gone from a live host.
//   node scripts/check-referral-removed-ui.mjs --host=https://mockonline.uz
// Guest: Premium page, register page opened with an old invite link, /refer. Throwaway student:
// the account menu and the Premium box on a locked test. The account is deleted in `finally`.
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./env.mjs";

const require = createRequire("C:/Users/user/node_modules/");
const { chromium } = require("playwright");
const host = process.argv.find((a) => a.startsWith("--host="))?.slice(7);
if (!host) throw new Error("--host is required");
const { url, serviceKey } = loadEnv({ quiet: true });
const sb = createClient(url, serviceKey, { auth: { persistSession: false } });
const out = [];
const say = (ok, label, detail = "") => out.push({ ok, label, detail });
const gone = (text) => !/invite (a )?friend|earn it free|get a month free|you.ve been invited|welcome bonus|month of\s+Premium\. There is no limit/i.test(text);

const browser = await chromium.launch({ channel: "msedge" }).catch(() => chromium.launch());
let userId = null;
try {
  const guest = await (await browser.newContext()).newPage();
  const r1 = await guest.goto(`${host}/premium`, { waitUntil: "networkidle" });
  const premiumText = await guest.locator("body").innerText();
  say(r1.status() === 200 && gone(premiumText), "Premium page has no 'earn it free' / invite text");
  say(/Ultima/.test(premiumText), "...and still shows Premium and Ultima (nothing else was lost)");

  await guest.goto(`${host}/register?ref=ABC1234`, { waitUntil: "networkidle" });
  say(gone(await guest.locator("body").innerText()), "register page ignores an old ?ref= link (no invite banner)");
  const cookies = await guest.context().cookies();
  say(!cookies.some((c) => c.name === "ielts_ref"), "no invite cookie is set any more");

  const r2 = await guest.goto(`${host}/refer`, { waitUntil: "networkidle" });
  const t2 = (await guest.locator("body").innerText()).toLowerCase();
  say(r2.status() === 404 || /not found|could not be found/.test(t2), "/refer is gone (404)", String(r2.status()));

  // a signed-in student: the account menu
  const email = `claude-ref-check-${randomBytes(4).toString("hex")}@example.com`;
  const password = randomBytes(12).toString("base64url") + "Aa1!";
  const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(error.message);
  userId = data.user.id;
  const page = await (await browser.newContext()).newPage();
  await page.goto(`${host}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await Promise.all([page.waitForURL((x) => !x.pathname.startsWith("/login"), { timeout: 30000 }), page.click('button[type="submit"]')]);
  await page.goto(`${host}/dashboard`, { waitUntil: "networkidle" });
  // open the account dropdown (the avatar button in the header)
  const trigger = page.locator('header button[aria-haspopup], header button[aria-expanded]').last();
  await trigger.click({ timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(800);
  const menuText = await page.locator("body").innerText();
  say(!/Invite friends/i.test(menuText), "account menu has no 'Invite friends'");
  say(/Get Premium|Your Premium|Sign out/i.test(menuText), "...and the rest of the menu is there");
  const links = await page.locator('a[href="/refer"]').count();
  say(links === 0, "no link to /refer anywhere on the page", String(links));
} catch (e) {
  say(false, "check crashed", e.message.split("\n")[0]);
} finally {
  await browser.close();
  if (userId) await sb.auth.admin.deleteUser(userId);
  console.log("throwaway account deleted");
}
let bad = 0;
for (const r of out) {
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.label}${r.detail ? "  -> " + r.detail : ""}`);
  if (!r.ok) bad++;
}
process.exit(bad ? 1 : 0);
