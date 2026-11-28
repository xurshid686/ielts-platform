// E2E for the Telegram Mini App sign-in (/tg + POST /api/telegram-miniapp/session).
// Signs initData with the REAL teacher-bot token (from .env.local) exactly as Telegram would,
// so it runs against a deployed host without Telegram. Throwaway accounts and fake chat ids
// (9e9+, never a real Telegram user) are created with the service role and DELETED in `finally`.
//
//   node scripts/e2e-miniapp.mjs [baseUrl]      (default: the dev preview)

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { loadEnv } from "./env.mjs";

loadEnv(); // live (Frankfurt): the deployed host's database
const local = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const TOKEN = /^TELEGRAM_TEACHER_BOT_TOKEN=(.*)$/m.exec(local)?.[1].trim().replace(/^"|"$/g, "");
if (!TOKEN) throw new Error("TELEGRAM_TEACHER_BOT_TOKEN missing from .env.local");

const BASE = (process.argv[2] || "https://ielts-platform-dev.vercel.app").replace(/\/+$/, "");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const fails = [];
const check = (ok, label) => { console.log(ok ? "✓" : "✗", label); if (!ok) fails.push(label); };
const stamp = Date.now();
const tgBase = 9_000_000_000 + Math.floor(Math.random() * 900_000_000);

function initData(tgId, { ageS = 5, lang = "en", token = TOKEN } = {}) {
  const p = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000) - ageS),
    query_id: `AAE${Math.random().toString(36).slice(2)}`,
    user: JSON.stringify({ id: tgId, first_name: "E2E", language_code: lang, allows_write_to_pm: true }),
  });
  const pairs = [...p].map(([k, v]) => `${k}=${v}`).sort().join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  p.set("hash", createHmac("sha256", secret).update(pairs).digest("hex"));
  return p.toString();
}
const tgUrl = (next, data, platform = "android") =>
  `${BASE}/tg?next=${encodeURIComponent(next)}#tgWebAppData=${encodeURIComponent(data)}&tgWebAppVersion=9.4&tgWebAppPlatform=${platform}`;

async function api(body, origin = BASE) {
  const res = await fetch(`${BASE}/api/telegram-miniapp/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(origin ? { Origin: origin } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

const users = [];
async function mkUser(tag, role) {
  const email = `e2e-${tag}-${stamp}@example.com`, password = "E2e-" + Math.random().toString(36).slice(2) + "A1!";
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: `E2E ${tag}` } });
  if (error) throw error;
  if (role) await admin.from("profiles").update({ role }).eq("id", data.user.id);
  const u = { id: data.user.id, email, password, name: `E2E ${tag}` };
  users.push(u);
  return u;
}
async function login(ctx, u) {
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`); await page.waitForLoadState("networkidle", { timeout: 60000 });
  await page.fill('input[type="email"]', u.email); await page.fill('input[type="password"]', u.password);
  await page.click('button[type="submit"]'); await page.waitForURL(/dashboard/, { timeout: 30000 });
  return page;
}
const bodyText = (page) => page.evaluate(() => document.body.innerText);
/** Whose session is this browser holding? Asks Supabase with the browser's own cookie. */
async function whoAmI(ctx) {
  const cookies = await ctx.cookies(BASE);
  const auth = cookies.filter((c) => /^sb-.*-auth-token(\.\d+)?$/.test(c.name)).sort((a, b) => a.name.localeCompare(b.name));
  if (!auth.length) return null;
  let raw = auth.map((c) => c.value).join("");
  if (raw.startsWith("base64-")) raw = Buffer.from(raw.slice(7), "base64").toString("utf8");
  const token = JSON.parse(decodeURIComponent(raw)).access_token;
  const { data } = await admin.auth.getUser(token);
  return data?.user?.id ?? null;
}

const browser = await chromium.launch({ channel: "msedge" });
try {
  const A = await mkUser("miniapp-a");
  const B = await mkUser("miniapp-b");
  const C = await mkUser("miniapp-admin", "admin");
  const tgA = tgBase + 1, tgB = tgBase + 2, tgC = tgBase + 3, tgNobody = tgBase + 4;
  for (const [u, chat] of [[A, tgA], [C, tgC]]) {
    const { error } = await admin.from("student_bot_links").insert({ user_id: u.id, chat_id: chat, daily_on: false });
    if (error) throw error;
  }

  // --- API refusals ---------------------------------------------------------------------------
  check((await api({ initData: initData(tgA) }, "https://evil.example")).status === 403, "cross-origin POST refused");
  check((await api({ initData: initData(tgA) }, null)).status === 403, "POST without Origin refused");
  const tampered = new URLSearchParams(initData(tgA));
  tampered.set("user", JSON.stringify({ id: tgB, first_name: "E2E" }));
  let r = await api({ initData: tampered.toString() });
  check(r.status === 401 && r.json.reason === "invalid", "tampered initData refused");
  r = await api({ initData: initData(tgA, { token: "1:not-our-bot" }) });
  check(r.status === 401 && r.json.reason === "invalid", "another bot's signature refused");
  r = await api({ initData: initData(tgA, { ageS: 600 }) });
  check(r.status === 401 && r.json.reason === "stale", "10-minute-old initData refused");
  r = await api({ initData: initData(tgNobody) });
  check(r.status === 404 && r.json.reason === "not_linked" && r.json.signedIn === false, "unlinked Telegram: not_linked");
  r = await api({ initData: initData(tgC) });
  check(r.status === 403 && r.json.reason === "admin", "admin is never signed in automatically");

  // --- the real page: linked student lands signed in ----------------------------------------
  const ctxA = await browser.newContext();
  const pA = await ctxA.newPage();
  await pA.goto(tgUrl("/dashboard", initData(tgA, { lang: "uz" })));
  await pA.waitForURL(/\/dashboard/, { timeout: 30000 }).catch(() => {});
  check(pA.url().includes("/dashboard"), "/tg forwards to next");
  check((await whoAmI(ctxA)) === A.id, "/tg signs the linked student in");

  // Replay of an initData that already minted a session, from another browser.
  const once = initData(tgA);
  r = await api({ initData: once });
  check(r.status === 200 && r.json.ok, "fresh initData mints a session (API)");
  r = await api({ initData: once });
  check(r.status === 401 && r.json.reason === "stale", "the same initData cannot mint twice");

  // --- signed in as B in this webview, Telegram says A: A wins ------------------------------
  const ctxSwitch = await browser.newContext();
  await login(ctxSwitch, B);
  check((await whoAmI(ctxSwitch)) === B.id, "precondition: browser signed in as B");
  const pS = await ctxSwitch.newPage();
  await pS.goto(tgUrl("/dashboard", initData(tgA)));
  await pS.waitForURL(/\/dashboard/, { timeout: 30000 }).catch(() => {});
  check((await whoAmI(ctxSwitch)) === A.id, "a different session is replaced by the Telegram owner's");

  // --- not linked, signed in by email: "Connect this Telegram" ------------------------------
  const ctxB = await browser.newContext();
  await login(ctxB, B);
  const pB = await ctxB.newPage();
  await pB.goto(tgUrl("/dashboard", initData(tgB, { lang: "uz" })));
  const linkBtn = pB.getByRole("button", { name: /Bu Telegramni .* akkauntiga ulash/ });
  await linkBtn.waitFor({ timeout: 30000 }).catch(() => {});
  check(await linkBtn.isVisible().catch(() => false), "unlinked + signed in: offers to connect (Uzbek)");
  await linkBtn.click().catch(() => {});
  await pB.waitForURL(/\/dashboard/, { timeout: 30000 }).catch(() => {});
  const { data: linkB } = await admin.from("student_bot_links").select("chat_id").eq("user_id", B.id).maybeSingle();
  check(Number(linkB?.chat_id) === tgB, "Connect binds this Telegram to the signed-in account");
  const ctxB2 = await browser.newContext();
  const pB2 = await ctxB2.newPage();
  await pB2.goto(tgUrl("/dashboard", initData(tgB)));
  await pB2.waitForURL(/\/dashboard/, { timeout: 30000 }).catch(() => {});
  check((await whoAmI(ctxB2)) === B.id, "next time B goes straight in");

  // --- not linked, not signed in ---------------------------------------------------------------
  const ctxN = await browser.newContext();
  const pN = await ctxN.newPage();
  await pN.goto(tgUrl("/dashboard", initData(tgNobody)));
  await pN.getByText("Connect your Telegram").waitFor({ timeout: 30000 }).catch(() => {});
  const tN = await bodyText(pN);
  check(tN.includes("Connect your Telegram") && tN.includes("Sign in with email"), "unlinked visitor: sign-in choices");
  check((await whoAmI(ctxN)) === null, "unlinked visitor: no session");

  // --- admin page, web client, plain browser ----------------------------------------------------
  const ctxC = await browser.newContext();
  const pC = await ctxC.newPage();
  await pC.goto(tgUrl("/dashboard", initData(tgC)));
  await pC.getByText("Admins sign in normally").waitFor({ timeout: 30000 }).catch(() => {});
  check((await bodyText(pC)).includes("Admins sign in normally") && (await whoAmI(ctxC)) === null, "admin page: refused, no session");

  const ctxW = await browser.newContext();
  const pW = await ctxW.newPage();
  await pW.goto(tgUrl("/dashboard", initData(tgA), "weba"));
  await pW.getByText("Opening in your browser").waitFor({ timeout: 30000 }).catch(() => {});
  check((await bodyText(pW)).includes("Opening in your browser") && (await whoAmI(ctxW)) === null, "web Telegram: hands off to a browser tab, no session");

  const ctxP = await browser.newContext();
  const pP = await ctxP.newPage();
  await pP.goto(`${BASE}/tg?next=${encodeURIComponent("/reading")}`);
  await pP.waitForURL(/\/reading/, { timeout: 30000 }).catch(() => {});
  check(pP.url().endsWith("/reading"), "outside Telegram: /tg is a plain redirect to next");

  const ctxO = await browser.newContext();
  const pO = await ctxO.newPage();
  await pO.goto(`${BASE}/tg?next=${encodeURIComponent("//evil.example/x")}`);
  await pO.waitForURL(/\/dashboard|\/login/, { timeout: 30000 }).catch(() => {});
  check(new URL(pO.url()).host === new URL(BASE).host, "next=//evil.example stays on our host");
} finally {
  await browser.close();
  for (const u of users) {
    await admin.from("student_bot_links").delete().eq("user_id", u.id);
    const { error } = await admin.auth.admin.deleteUser(u.id);
    if (error) console.log("cleanup failed for", u.email, error.message);
  }
  console.log(`cleanup: ${users.length} throwaway accounts deleted`);
}
console.log(fails.length ? `\n${fails.length} FAILED` : "\nall passed");
process.exit(fails.length ? 1 : 0);
