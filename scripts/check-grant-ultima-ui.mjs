// Browser check of Grant / Revoke Ultima on /admin/members, with two throwaway accounts (an admin
// and a plain student). Both are deleted in `finally`.
//   node scripts/check-grant-ultima-ui.mjs --host=https://mockonline.uz
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
  const email = `claude-grant-check-${name}-${tag}@example.com`;
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
const ultimaRow = async (id) => (await sb.from("ultima_members").select("ultima_until").eq("user_id", id).maybeSingle()).data;

const browser = await chromium.launch({ channel: "msedge" }).catch(() => chromium.launch());
try {
  const admin = await make("admin");
  const target = await make("student");
  await sb.from("profiles").update({ role: "admin" }).eq("id", admin.id);

  const page = await (await browser.newContext()).newPage();
  await page.goto(`${host}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', admin.email);
  await page.fill('input[type="password"]', admin.password);
  await Promise.all([page.waitForURL((x) => !x.pathname.startsWith("/login"), { timeout: 30000 }), page.click('button[type="submit"]')]);

  await page.goto(`${host}/admin/members`, { waitUntil: "networkidle" });
  const search = page.locator('input[type="search"], input[placeholder*="earch" i]').first();
  await search.fill(target.email);
  await search.press("Enter");
  const row = page.locator("li", { hasText: target.email }).first();
  await row.waitFor({ timeout: 20000 });

  say((await ultimaRow(target.id)) === null, "target starts without Ultima");
  await row.getByRole("button", { name: /Grant Ultima/ }).click();
  await page.waitForTimeout(3500);
  const granted = await ultimaRow(target.id);
  say(!!granted && new Date(granted.ultima_until) > new Date(), "Grant Ultima writes an end date in the future", granted ? granted.ultima_until : "no row");
  say((await row.getByText("Ultima", { exact: true }).count()) > 0 || (await row.getByRole("button", { name: /Revoke Ultima/ }).count()) > 0, "the row now shows the Ultima badge / Revoke button");

  await row.getByRole("button", { name: /Revoke Ultima/ }).click();
  await page.waitForTimeout(3500);
  say((await ultimaRow(target.id)) === null, "Revoke Ultima removes it");
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
