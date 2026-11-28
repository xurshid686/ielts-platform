// e2e-listening-pdf.mjs --host=<base> [--listening=<test id>]
// Listening "Get a PDF" (0081). Same shape as check-ultima-ui.mjs, for a PREMIUM listening test,
// plus a reading regression check. Two throwaway accounts, both Premium:
//   A: holds Ultima  -> must see the PDF button on reading cards, in the runner top bar, and the
//                       button route must redirect to the teacher bot with a link code;
//   B: plain student -> must see NO PDF button anywhere.
// Both accounts (and everything hanging off them) are deleted in `finally`.
//
//   node scripts/check-ultima-ui.mjs --host=https://mockonline.uz
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
const tag = randomBytes(4).toString("hex");
const users = [];
const results = [];
const say = (ok, label, detail = "") => results.push({ ok, label, detail });

async function makeUser(name, ultima) {
  const email = `claude-listening-pdf-${name}-${tag}@example.com`;
  const password = randomBytes(12).toString("base64url") + "Aa1!";
  const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(error.message);
  users.push(data.user.id);
  // the profile row comes from the signup trigger; give it a moment
  for (let i = 0; i < 10; i++) {
    const { data: p } = await sb.from("profiles").select("id").eq("id", data.user.id).maybeSingle();
    if (p) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  await sb.from("profiles").update({ premium_until: new Date(Date.now() + 86400000).toISOString() }).eq("id", data.user.id);
  if (ultima) {
    const { error: e2 } = await sb.from("ultima_members").upsert({ user_id: data.user.id, ultima_until: new Date(Date.now() + 86400000).toISOString() });
    if (e2) throw new Error(e2.message);
  }
  return { id: data.user.id, email, password };
}

async function login(browser, u) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${host}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', u.email);
  await page.fill('input[type="password"]', u.password);
  await Promise.all([page.waitForURL((x) => !x.pathname.startsWith("/login"), { timeout: 30000 }), page.click('button[type="submit"]')]);
  return { ctx, page };
}

// a listening test that has a registered PDF (default: Test 20), and any reading test with one
const testId = process.argv.find((a) => a.startsWith("--listening="))?.slice(12) || "f210b951-e731-46d7-96ec-977d939719af";
const { data: lp } = await sb.from("test_pdfs").select("test_id, audio_url").eq("test_id", testId).single();
say(!!lp?.audio_url, "the listening test has a PDF row with an audio_url", lp?.audio_url || "none");
const { data: pdfIds } = await sb.from("test_pdfs").select("test_id");
const { data: rd } = await sb.from("tests").select("id").in("id", pdfIds.map((r) => r.test_id).slice(0, 200)).eq("skill", "reading").limit(1);
const readingId = rd[0].id;
const browser = await chromium.launch({ channel: "msedge" }).catch(() => chromium.launch());
try {
  const a = await makeUser("ultima", true);
  const b = await makeUser("plain", false);

  // ---- A: Ultima
  {
    const { ctx, page } = await login(browser, a);
    await page.goto(`${host}/listening`, { waitUntil: "networkidle" });
    const cards = await page.locator('button[title^="Get this test as a PDF"]').count();
    say(cards > 0, "Ultima user sees PDF buttons on listening cards", `${cards} buttons`);
    await page.goto(`${host}/reading`, { waitUntil: "networkidle" });
    const rcards = await page.locator('button[title^="Get this test as a PDF"]').count();
    say(rcards > 0, "reading cards still carry PDF buttons (regression)", `${rcards} buttons`);
    await page.goto(`${host}/listening/${testId}`, { waitUntil: "networkidle" });
    // the signed-in student page mounts the runner; its top bar carries the link
    const link = page.locator('a[href^="/api/ultima/pdf?test="]');
    await link.first().waitFor({ timeout: 20000 }).catch(() => {});
    say((await link.count()) > 0, "Ultima user sees 'Get a PDF' in the LISTENING runner's top bar");
    const res = await ctx.request.get(`${host}/api/ultima/pdf?test=${testId}`, { maxRedirects: 0 });
    const loc = res.headers()["location"] || "";
    say([301, 302, 307].includes(res.status()) && /^https:\/\/t\.me\/MockOnlineMaterials_bot\?start=pdf_[0-9a-f-]{36}_[A-Za-z0-9]{12}$/.test(loc),
      "button route sends the Ultima user to the teacher bot with a one-time code", `${res.status()} ${loc.replace(/_[A-Za-z0-9]{12}$/, "_<code>")}`);
    await ctx.close();
  }
  // ---- B: plain student
  {
    const { ctx, page } = await login(browser, b);
    await page.goto(`${host}/listening`, { waitUntil: "networkidle" });
    say((await page.locator('button[title^="Get this test as a PDF"]').count()) === 0, "Premium (not Ultima) student sees NO PDF button on listening cards");
    await page.goto(`${host}/listening/${testId}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    // the route itself still redirects (the bot decides the plan), but the page must not offer it... the
    // runner shows the link only to everyone signed in, so check what the product decided:
    const shown = await page.locator('a[href^="/api/ultima/pdf?test="]').count();
    say(shown === 0, "Premium (not Ultima) student sees NO 'Get a PDF' link in the listening runner");
    await ctx.close();
  }
} catch (e) {
  say(false, "check crashed", e.message);
} finally {
  await browser.close();
  for (const id of users) await sb.auth.admin.deleteUser(id);
  const { count } = await sb.from("profiles").select("id", { count: "exact", head: true }).in("id", users.length ? users : ["00000000-0000-0000-0000-000000000000"]);
  console.log(`throwaway accounts deleted (profiles left: ${count})`);
}
let bad = 0;
for (const r of results) {
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.label}${r.detail ? "  -> " + r.detail : ""}`);
  if (!r.ok) bad++;
}
process.exit(bad ? 1 : 0);
