// Browser check of the Ultima plans on the Premium page and the "Ultima includes Premium" grant,
// with throwaway accounts (an admin, a student). Everything is deleted in `finally`.
//   node scripts/check-ultima-plans-ui.mjs --host=https://ielts-platform-dev.vercel.app
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
const ids = [];
const out = [];
const say = (ok, label, detail = "") => out.push({ ok, label, detail });

async function make(name) {
  const email = `claude-plans-check-${name}-${tag}@example.com`;
  const password = randomBytes(12).toString("base64url") + "Aa1!";
  const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(error.message);
  ids.push(data.user.id);
  for (let i = 0; i < 10; i++) {
    const { data: p } = await sb.from("profiles").select("id").eq("id", data.user.id).maybeSingle();
    if (p) break;
    await new Promise((r) => setTimeout(r, 500));
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
  return page;
}
const state = async (id) => {
  const { data: u } = await sb.from("ultima_members").select("ultima_until").eq("user_id", id).maybeSingle();
  const { data: p } = await sb.from("profiles").select("premium_until").eq("id", id).single();
  return { ultima: u?.ultima_until ?? null, premium: p?.premium_until ?? null };
};

const browser = await chromium.launch({ channel: "msedge" }).catch(() => chromium.launch());
try {
  // ---- a guest
  {
    const page = await (await browser.newContext()).newPage();
    await page.goto(`${host}/premium`, { waitUntil: "networkidle" });
    const section = page.locator("#ultima");
    say((await section.count()) === 1, "guest sees the Ultima section (#ultima)");
    const txt = (await section.innerText()).replace(/\s+/g, " ");
    say(txt.includes("$5") && txt.includes("$12") && /1 month/.test(txt) && /3 months/.test(txt), "it shows $5 / 1 month and $12 / 3 months");
    say(/Includes Premium/i.test(txt), "it says Ultima includes Premium");
    const table = (await page.locator("table", { hasText: "Premium tests" }).first().innerText()).replace(/\s+/g, " ");
    say(/Ultima/.test(table) && /PDF of every reading test/.test(table), "the comparison table has an Ultima column and the PDF row");
  }

  const admin = await make("admin");
  const student = await make("student");
  await sb.from("profiles").update({ role: "admin" }).eq("id", admin.id);

  // ---- a signed-in student: the request link
  {
    const page = await login(browser, student);
    await page.goto(`${host}/premium`, { waitUntil: "networkidle" });
    const hrefs = await page.locator('#ultima a[href^="https://t.me/ListeningReadingTests"]').evaluateAll((a) => a.map((x) => x.getAttribute("href")));
    say(hrefs.length === 2, "student sees two Ultima request buttons", String(hrefs.length));
    const t = decodeURIComponent((hrefs[0] || "").split("?text=")[1] || "");
    say(t.includes("Ultima (includes Premium)") && t.includes("$5") && t.includes(student.email), "the 1-month link carries plan, price and the student's email");
  }

  // ---- admin grants Ultima: it must also extend Premium
  {
    const page = await login(browser, admin);
    await page.goto(`${host}/admin/members`, { waitUntil: "networkidle" });
    const search = page.locator('input[type="search"], input[placeholder*="earch" i]').first();
    await search.fill(student.email);
    await search.press("Enter");
    const row = page.locator("li", { hasText: student.email }).first();
    await row.waitFor({ timeout: 20000 });
    say(JSON.stringify(await state(student.id)) === JSON.stringify({ ultima: null, premium: null }), "student starts with neither Ultima nor Premium");
    await row.getByRole("button", { name: /Grant Ultima/ }).click();
    await page.waitForTimeout(4000);
    const after = await state(student.id);
    const future = (x) => !!x && new Date(x) > new Date();
    say(future(after.ultima), "Grant Ultima sets an Ultima end date", String(after.ultima));
    say(future(after.premium), "...and ALSO extends Premium (Ultima includes Premium)", String(after.premium));

    // the student's own page shows it
    const sp = await login(browser, student);
    await sp.goto(`${host}/premium`, { waitUntil: "networkidle" });
    say(/You have Ultima until/.test(await sp.locator("#ultima").innerText()), "the student's page says 'You have Ultima until ...'");

    // revoke Ultima: Premium stays
    await row.getByRole("button", { name: /Revoke Ultima/ }).click();
    await page.waitForTimeout(4000);
    const rev = await state(student.id);
    say(rev.ultima === null, "Revoke Ultima removes the Ultima plan");
    say(future(rev.premium), "...and leaves Premium in place");
  }
} catch (e) {
  say(false, "check crashed", e.message.split("\n")[0]);
} finally {
  await browser.close();
  for (const id of ids) await sb.auth.admin.deleteUser(id);
  console.log("throwaway accounts deleted");
}
let bad = 0;
for (const r of out) {
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.label}${r.detail ? "  -> " + r.detail : ""}`);
  if (!r.ok) bad++;
}
process.exit(bad ? 1 : 0);
