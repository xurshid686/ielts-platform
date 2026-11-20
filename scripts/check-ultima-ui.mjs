// Browser check of the Ultima PDF button on a live host, with two throwaway accounts:
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
  const email = `claude-ultima-check-${name}-${tag}@example.com`;
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

// a FREE regular-track test with a PDF, so a non-premium student reaches the runner, not a lock screen
const { data: pdfIds } = await sb.from("test_pdfs").select("test_id");
const { data: freeTests } = await sb.from("tests").select("id").in("id", pdfIds.map((r) => r.test_id).slice(0, 200)).eq("tier", "free").eq("skill", "reading").eq("kind", "single").limit(1);
const testId = freeTests[0].id;
const browser = await chromium.launch({ channel: "msedge" }).catch(() => chromium.launch());
try {
  const a = await makeUser("ultima", true);
  const b = await makeUser("plain", false);

  // ---- A: Ultima
  {
    const { ctx, page } = await login(browser, a);
    await page.goto(`${host}/reading`, { waitUntil: "networkidle" });
    if (process.argv.includes("--debug")) {
      const html = await page.content();
      console.log("DEBUG /reading html has ultima/pdf:", html.includes("ultima/pdf"), "| 'Get this test':", html.includes("Get this test"), "| PDF word:", (html.match(/>\s*PDF\s*</g) || []).length, "| cards:", (html.match(/<h3/g) || []).length);
      page.on("console", (m) => m.type() === "error" && console.log("DEBUG console error:", m.text().slice(0, 160)));
    }
    const cards = await page.locator('button[title^="Get this test as a PDF"]').count();
    say(cards > 0, "Ultima user sees PDF buttons on reading cards", `${cards} buttons`);
    await page.goto(`${host}/reading/${testId}`, { waitUntil: "networkidle" });
    // the signed-in student page mounts the runner; its top bar carries the link
    const link = page.locator('a[href^="/api/ultima/pdf?test="]');
    await link.first().waitFor({ timeout: 20000 }).catch(() => {});
    say((await link.count()) > 0, "Ultima user sees 'Get a PDF' in the test runner's top bar");
    const res = await ctx.request.get(`${host}/api/ultima/pdf?test=${testId}`, { maxRedirects: 0 });
    const loc = res.headers()["location"] || "";
    say([301, 302, 307].includes(res.status()) && /^https:\/\/t\.me\/MockOnlineMaterials_bot\?start=pdf_[0-9a-f-]{36}_[A-Za-z0-9]{12}$/.test(loc),
      "button route sends the Ultima user to the teacher bot with a one-time code", `${res.status()} ${loc.replace(/_[A-Za-z0-9]{12}$/, "_<code>")}`);
    await ctx.close();
  }
  // ---- B: plain student
  {
    const { ctx, page } = await login(browser, b);
    await page.goto(`${host}/reading`, { waitUntil: "networkidle" });
    say((await page.locator('button[title^="Get this test as a PDF"]').count()) === 0, "plain student sees NO PDF button on cards");
    await page.goto(`${host}/reading/${testId}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    // the route itself still redirects (the bot decides the plan), but the page must not offer it... the
    // runner shows the link only to everyone signed in, so check what the product decided:
    const shown = await page.locator('a[href^="/api/ultima/pdf?test="]').count();
    say(shown === 0, "plain student sees NO 'Get a PDF' link in the test runner's top bar");
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
