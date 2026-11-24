// E2E for 0073 online payment, on a host that has TEST keys (the dev preview).
// The script plays Payme and Click: it signs their webhook calls with the
// test keys and walks every path, asserting premium_until moves exactly once.
// Throwaway account, its orders and notifications are DELETED at the end.
//
// Usage: node scripts/e2e-payments.mjs [baseUrl] --keys=<file with E2E_* lines>
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./env.mjs";
loadEnv();
const BASE = process.argv.slice(2).find((a) => !a.startsWith("--")) || "https://ielts-platform-dev.vercel.app";
const keysFile = process.argv.find((a) => a.startsWith("--keys="))?.slice(7);
if (keysFile) for (const line of readFileSync(keysFile, "utf8").split(/\r?\n/)) {
  const m = line.match(/^(E2E_[A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2];
}
const K = {
  paymeKey: process.env.E2E_PAYME_KEY, clickService: process.env.E2E_CLICK_SERVICE_ID, clickSecret: process.env.E2E_CLICK_SECRET_KEY,
};
if (!K.paymeKey || !K.clickSecret) throw new Error("test keys missing (--keys=<file>)");

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const fails = [];
const check = (ok, label) => { console.log(ok ? "✓" : "✗", label); if (!ok) fails.push(label); };
const DAY = 864e5;

// ---------- provider simulators
let rpcId = 1;
async function payme(method, params, key = K.paymeKey) {
  const r = await fetch(`${BASE}/api/payments/payme`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Basic ${btoa(`Paycom:${key}`)}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: rpcId++, method, params }),
  });
  return r.json();
}
function clickSigned(p, secret = K.clickSecret) {
  const prep = p.action === "1" ? p.merchant_prepare_id : "";
  const sign = createHash("md5").update(`${p.click_trans_id}${p.service_id}${secret}${p.merchant_trans_id}${prep}${p.amount}${p.action}${p.sign_time}`).digest("hex");
  return { ...p, sign_string: sign };
}
async function click(action, p) {
  const r = await fetch(`${BASE}/api/payments/click/${action}`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(p).toString(),
  });
  return r.json();
}
const clickBase = (orderId, amount, trans) => ({
  click_trans_id: trans, service_id: K.clickService, click_paydoc_id: "1", merchant_trans_id: orderId,
  amount, error: "0", error_note: "Success", sign_time: "2026-11-24 22:00:00",
});

// ---------- account
const email = `e2e-pay-${Date.now()}@example.com`, password = "E2e-" + Math.random().toString(36).slice(2) + "A1!";
const { data: u, error: ue } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: "E2E Payer" } });
if (ue) throw ue;
const uid = u.user.id;
const until = async () => {
  const { data } = await admin.from("profiles").select("premium_until").eq("id", uid).single();
  return data.premium_until ? new Date(data.premium_until).getTime() : null;
};
const order = async (id) => (await admin.from("payment_orders").select("*").eq("id", id).single()).data;

const browser = await chromium.launch({ channel: "msedge" });
try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await page.goto(`${BASE}/login`); await page.waitForLoadState("networkidle", { timeout: 60000 });
  await page.fill('input[type="email"]', email); await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]'); await page.waitForURL(/dashboard/, { timeout: 30000 });

  // Never actually leave for the providers' sites: capture where we were sent.
  await page.route(/checkout\.paycom\.uz|my\.click\.uz/, (r) => r.fulfill({ status: 200, body: "provider" }));
  // The new /premium (2026-11-24): period tab -> "Get Premium" -> chooser -> method -> Pay.
  async function startPay(provider, cardIndex, plan = "premium") {
    await page.goto(`${BASE}/premium`); await page.waitForLoadState("networkidle", { timeout: 60000 });
    await page.getByRole("tab", { name: cardIndex === 0 ? /^1 month/ : /^3 months/ }).click();
    await page.locator(`[data-buy="${plan}"]`).click();
    await page.getByRole("dialog").waitFor();
    await page.locator(`[data-method="${provider}"]`).click();
    const [req] = await Promise.all([
      page.waitForRequest(/checkout\.paycom\.uz|my\.click\.uz/, { timeout: 30000 }),
      page.getByRole("dialog").getByRole("button", { name: /^Pay / }).click(),
    ]);
    return req.url();
  }

  await page.goto(`${BASE}/premium`); await page.waitForLoadState("networkidle", { timeout: 60000 });
  let txt = await page.evaluate(() => document.body.innerText);
  check(txt.includes("60\u00a0000 so'm"), "3 months is the default: 60 000 so'm");
  await page.getByRole("tab", { name: /^1 month/ }).click();
  txt = await page.evaluate(() => document.body.innerText);
  check(txt.includes("25\u00a0000 so'm"), "1 month tab: 25 000 so'm");
  await page.locator('[data-buy="premium"]').click();
  await page.getByRole("dialog").waitFor();
  const enabled = await page.evaluate(() => ["payme", "click", "telegram"].map((m) => !document.querySelector(`[data-method="${m}"]`)?.disabled));
  check(enabled.every(Boolean), `chooser: Payme, Click and Telegram all selectable (${enabled})`);
  check((await page.getByRole("dialog").innerText()).includes("Premium · 1 month"), "chooser names the plan and period");
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  await page.locator('[data-buy="ultima"]').click();
  await page.getByRole("dialog").waitFor();
  const ud = await page.getByRole("dialog").innerText();
  check(await page.locator('[data-method="payme"]').count() === 1 && await page.locator('[data-method="click"]').count() === 1 && ud.includes("Ultima · 1 month") && ud.includes("50\u00a0000 so'm"),
    "Ultima chooser offers Payme + Click + Telegram at 50 000 so'm");
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();

  // ================= PAYME =================
  const pUrl = await startPay("payme", 0);
  const decoded = atob(pUrl.split("/").pop());
  const pOrder = decoded.match(/ac\.order_id=([0-9a-f-]{36})/)[1];
  check(/a=2500000;/.test(decoded), `Payme checkout carries 2 500 000 tiyin for 1 month (${decoded.slice(0, 60)}…)`);
  check((await order(pOrder)).user_id === uid, "order belongs to the student");

  let r = await payme("CheckPerformTransaction", { amount: 2500000, account: { order_id: pOrder } }, "wrong-key");
  check(r.error?.code === -32504, `wrong key -> -32504 (${r.error?.code})`);
  r = await payme("CheckPerformTransaction", { amount: 100, account: { order_id: pOrder } });
  check(r.error?.code === -31001, `wrong amount -> -31001 (${r.error?.code})`);
  r = await payme("CheckPerformTransaction", { amount: 2500000, account: { order_id: "00000000-0000-0000-0000-000000000000" } });
  check(r.error?.code === -31050, `unknown order -> -31050 (${r.error?.code})`);
  r = await payme("CheckPerformTransaction", { amount: 2500000, account: { order_id: pOrder } });
  check(r.result?.allow === true, "CheckPerformTransaction allows");

  const tx1 = `payme-tx-${Date.now()}`;
  r = await payme("CreateTransaction", { id: tx1, time: Date.now(), amount: 2500000, account: { order_id: pOrder } });
  check(r.result?.state === 1 && r.result?.transaction === pOrder, "CreateTransaction -> state 1");
  const ct = r.result?.create_time;
  r = await payme("CreateTransaction", { id: tx1, time: Date.now(), amount: 2500000, account: { order_id: pOrder } });
  check(r.result?.create_time === ct, "CreateTransaction repeat -> same transaction");
  r = await payme("CreateTransaction", { id: tx1 + "-other", time: Date.now(), amount: 2500000, account: { order_id: pOrder } });
  check(r.error?.code <= -31050 && r.error?.code >= -31099, `second transaction on the order refused (${r.error?.code})`);
  check(await until() === null, "no Premium before Perform");

  r = await payme("PerformTransaction", { id: tx1 });
  check(r.result?.state === 2, "PerformTransaction -> state 2");
  const u1 = await until();
  check(u1 && Math.abs(u1 - Date.now() - 30 * DAY) < 2.5 * DAY, `Premium +1 month (${u1 && ((u1 - Date.now()) / DAY).toFixed(1)} days)`);
  r = await payme("PerformTransaction", { id: tx1 });
  check(r.result?.state === 2 && (await until()) === u1, "Perform retry -> paid ONCE");
  r = await payme("CheckTransaction", { id: tx1 });
  check(r.result?.state === 2 && r.result?.perform_time > 0, "CheckTransaction -> state 2 with perform_time");
  r = await payme("GetStatement", { from: Date.now() - DAY, to: Date.now() + DAY });
  check(r.result?.transactions?.some((t) => t.id === tx1), "GetStatement lists the transaction");

  // thank-you page for the paid order
  await page.goto(`${BASE}/premium/thanks?order=${pOrder}`); await page.waitForLoadState("load");
  await page.getByText("Premium is on").waitFor({ timeout: 20000 });
  check(true, "/premium/thanks shows 'Premium is on'");
  const { data: notes } = await admin.from("notifications").select("type").eq("user_id", uid).eq("type", "premium_paid");
  check(notes?.length === 1, "one 'Payment received' notification");

  r = await payme("CancelTransaction", { id: tx1, reason: 5 });
  check(r.result?.state === -2, "Cancel after perform (refund) -> state -2");
  const u2 = await until();
  check(u2 !== null && u2 - Date.now() < 0.1 * DAY, "refund took the month back");
  r = await payme("CancelTransaction", { id: tx1, reason: 5 });
  check(r.result?.state === -2, "Cancel repeat -> same state");
  r = await payme("PerformTransaction", { id: tx1 });
  check(r.error?.code === -31008, `Perform after cancel -> -31008 (${r.error?.code})`);

  // cancel BEFORE perform: no Premium at all
  const p3 = atob((await startPay("payme", 1)).split("/").pop()).match(/ac\.order_id=([0-9a-f-]{36})/)[1];
  const tx3 = `payme-tx3-${Date.now()}`;
  await payme("CreateTransaction", { id: tx3, time: Date.now(), amount: 6000000, account: { order_id: p3 } });
  const before = await until();
  r = await payme("CancelTransaction", { id: tx3, reason: 3 });
  check(r.result?.state === -1 && (await until()) === before, "Cancel before perform -> state -1, Premium untouched");
  r = await payme("PerformTransaction", { id: tx3 });
  check(r.error?.code === -31008, "Perform of a cancelled transaction refused");
  r = await payme("Nonsense", {});
  check(r.error?.code === -32601, "unknown method -> -32601");

  // ================= CLICK =================
  const cUrl = new URL(await startPay("click", 1));
  const cOrder = cUrl.searchParams.get("transaction_param");
  check(cUrl.searchParams.get("amount") === "60000", `Click link carries 60000 so'm for 3 months`);
  const trans = String(Date.now());

  let c = await click("prepare", { ...clickBase(cOrder, "60000", trans), action: "0", sign_string: "0".repeat(32) });
  check(c.error === -1, `bad signature -> -1 (${c.error})`);
  c = await click("prepare", clickSigned({ ...clickBase(cOrder, "100", trans), action: "0" }));
  check(c.error === -2, `wrong amount -> -2 (${c.error})`);
  c = await click("prepare", clickSigned({ ...clickBase(pOrder, "25000", trans), action: "0" }));
  check(c.error === -5, `a Payme order on the Click endpoint -> -5 (${c.error})`);
  c = await click("prepare", clickSigned({ ...clickBase(cOrder, "60000", trans), action: "0" }));
  check(c.error === 0 && c.merchant_prepare_id, "Prepare -> 0 with merchant_prepare_id");
  const prep = String(c.merchant_prepare_id);
  const beforeC = await until();
  c = await click("complete", clickSigned({ ...clickBase(cOrder, "60000", trans), action: "1", merchant_prepare_id: prep }));
  check(c.error === 0, `Complete -> 0 (${c.error})`);
  const u3 = await until();
  check(u3 - Math.max(Date.now(), beforeC ?? 0) > 88 * DAY && u3 - Date.now() < 93 * DAY, `Premium +3 months (${((u3 - Date.now()) / DAY).toFixed(1)} days)`);
  c = await click("complete", clickSigned({ ...clickBase(cOrder, "60000", trans), action: "1", merchant_prepare_id: prep }));
  check(c.error === -4 && (await until()) === u3, "Complete retry -> -4 already paid, Premium unchanged");

  // a failed Click payment closes the order and grants nothing.
  // (A real payment shows the Premium welcome pop-up; dismiss it the way the UI would.)
  await admin.from("profiles").update({ premium_announce: false }).eq("id", uid);
  const c2 = new URL(await startPay("click", 0)).searchParams.get("transaction_param");
  const trans2 = String(Date.now() + 1);
  c = await click("prepare", clickSigned({ ...clickBase(c2, "25000", trans2), action: "0" }));
  c = await click("complete", clickSigned({ ...clickBase(c2, "25000", trans2), error: "-5017", action: "1", merchant_prepare_id: String(c.merchant_prepare_id) }));
  check(c.error === -9 && (await order(c2)).status === "cancelled" && (await until()) === u3, "failed Click payment -> -9, order cancelled, no Premium");

  // ================= ULTIMA (0074) via Click, 1 month =================
  await admin.from("profiles").update({ premium_announce: false }).eq("id", uid);
  const uUrl = new URL(await startPay("click", 0, "ultima"));
  const uOrder = uUrl.searchParams.get("transaction_param");
  check(uUrl.searchParams.get("amount") === "50000", "Ultima 1 month: Click link carries 50000 so'm");
  check((await order(uOrder)).plan === "ultima", "order is an Ultima order");
  const ut = String(Date.now() + 7);
  const premBefore = await until();
  c = await click("prepare", clickSigned({ ...clickBase(uOrder, "50000", ut), action: "0" }));
  c = await click("complete", clickSigned({ ...clickBase(uOrder, "50000", ut), action: "1", merchant_prepare_id: String(c.merchant_prepare_id) }));
  check(c.error === 0, `Ultima Complete -> 0 (${c.error})`);
  const { data: um } = await admin.from("ultima_members").select("ultima_until").eq("user_id", uid).maybeSingle();
  const ud2 = um ? (new Date(um.ultima_until) - Date.now()) / DAY : 0;
  check(ud2 > 27 && ud2 < 32, `Ultima +1 month (${ud2.toFixed(1)} days)`);
  const premAfter = await until();
  check(premAfter - Math.max(premBefore ?? 0, Date.now()) > 27 * DAY, "Premium extended by the same month");
  await page.goto(`${BASE}/premium/thanks?order=${uOrder}`); await page.waitForLoadState("load");
  await page.getByText("Ultima is on").waitFor({ timeout: 20000 });
  check(true, "/premium/thanks says 'Ultima is on'");
} finally {
  await browser.close();
  await admin.from("ultima_members").delete().eq("user_id", uid);
  await admin.from("payment_orders").delete().eq("user_id", uid);
  await admin.from("notifications").delete().eq("user_id", uid);
  await admin.auth.admin.deleteUser(uid);
  console.log("cleanup: user, orders, notifications deleted");
}
console.log(fails.length ? `\nFAILED: ${fails.length}` : "\nALL PASSED");
process.exit(fails.length ? 1 : 0);
