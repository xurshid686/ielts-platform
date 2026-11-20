// Browser check: the AI writing-check allowance is 10 for Premium and 20 for Ultima, and the Premium
// page says so. Two throwaway students (deleted in `finally`).
//   node scripts/check-ultima-checks-ui.mjs --host=https://mockonline.uz
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
const future = new Date(Date.now() + 30 * 86400000).toISOString();

async function make(name, ultima) {
  const email = `claude-checks-check-${name}-${tag}@example.com`;
  const password = randomBytes(12).toString("base64url") + "Aa1!";
  const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(error.message);
  ids.push(data.user.id);
  for (let i = 0; i < 10; i++) {
    const { data: p } = await sb.from("profiles").select("id").eq("id", data.user.id).maybeSingle();
    if (p) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  await sb.from("profiles").update({ premium_until: future }).eq("id", data.user.id);
  if (ultima) await sb.from("ultima_members").upsert({ user_id: data.user.id, ultima_until: future });
  return { email, password };
}
async function meter(browser, u) {
  const page = await (await browser.newContext()).newPage();
  await page.goto(`${host}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', u.email);
  await page.fill('input[type="password"]', u.password);
  await Promise.all([page.waitForURL((x) => !x.pathname.startsWith("/login"), { timeout: 30000 }), page.click('button[type="submit"]')]);
  await page.goto(`${host}/writing`, { waitUntil: "networkidle" });
  const text = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  const m = text.match(/(\d+) of (\d+) AI checks left/);
  return m ? { left: Number(m[1]), limit: Number(m[2]) } : null;
}

const browser = await chromium.launch({ channel: "msedge" }).catch(() => chromium.launch());
try {
  const prem = await make("premium", false);
  const ult = await make("ultima", true);
  const a = await meter(browser, prem);
  const b = await meter(browser, ult);
  say(a?.limit === 10 && a?.left === 10, "Premium student sees 10 of 10 AI checks", JSON.stringify(a));
  say(b?.limit === 20 && b?.left === 20, "Ultima student sees 20 of 20 AI checks", JSON.stringify(b));

  const page = await (await browser.newContext()).newPage();
  await page.goto(`${host}/premium`, { waitUntil: "networkidle" });
  const table = (await page.locator("table", { hasText: "Premium tests" }).first().innerText()).replace(/\s+/g, " ");
  say(/AI writing checks each month\s*No\s*10\s*20/.test(table), "plan table shows AI writing checks: Free No, Premium 10, Ultima 20", table.match(/AI writing checks each month[^A-Z]*/)?.[0] ?? "row missing");
  say(!/Answers, hidden behind a blur/.test(table), "the 'Answers, hidden behind a blur' row is gone");
  say(/20 AI writing checks a month/.test(await page.locator("#ultima").innerText()), "the Ultima section mentions 20 AI writing checks a month");
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
