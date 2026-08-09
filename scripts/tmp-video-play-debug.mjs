// Why won't the intro video PLAY inside the site's iframe? Drives the real
// player as a premium member and reports what the video element actually does.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright-core";

const root = "C:/Users/user/ielts-platform";
for (const line of readFileSync(root + "/.env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const BASE = process.env.DEBUG_BASE || "https://ielts-platform-dev.vercel.app";
const TEST_ID = "b1d10ac6-29bb-4b4c-8f16-0e9474530ee9";
const EMAIL = `tmp-play-${Date.now()}@example.com`;
const PASSWORD = "Tmp!Play-" + Math.random().toString(36).slice(2, 10);

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: created } = await admin.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true });
const uid = created.user.id;
await admin.from("profiles").update({ premium_until: new Date(Date.now() + 7 * 864e5).toISOString() }).eq("id", uid);

const browser = await chromium.launch({ channel: "chrome", args: ["--mute-audio"] });
try {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.log(`[console.${m.type()}]`, m.text().slice(0, 200)); });
  page.on("pageerror", (e) => console.log("[pageerror]", e.message.slice(0, 200)));
  page.on("response", (r) => { if (r.url().includes("/api/test-video/")) console.log("[video response]", r.status(), JSON.stringify(r.headers())); });

  await page.goto(BASE + "/login", { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 60000 });

  await page.goto(`${BASE}/reading/${TEST_ID}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const handle = await page.waitForSelector("iframe", { timeout: 60000 });
  const f = await handle.contentFrame();
  await f.waitForSelector("#introVideoBlock", { timeout: 60000 });

  console.log("iframe sandbox:", await page.$eval("iframe", (el) => el.getAttribute("sandbox")));
  console.log("iframe allow:", await page.$eval("iframe", (el) => el.getAttribute("allow")));

  // wait for the preload to finish (or report where it got stuck)
  for (let i = 0; i < 40; i++) {
    const st = await f.evaluate(() => {
      const p = document.getElementById("introVideoPlay");
      const v = document.getElementById("introVideo");
      return { label: p?.getAttribute("data-label"), disabled: p?.disabled, src: (v?.src || "").slice(0, 40), readyState: v?.readyState };
    });
    if (!st.disabled) { console.log("preload finished:", JSON.stringify(st)); break; }
    if (i % 8 === 0) console.log("preloading…", JSON.stringify(st));
    await page.waitForTimeout(1000);
  }

  const before = await f.evaluate(() => {
    const v = document.getElementById("introVideo");
    return { src: (v.src || "").slice(0, 40), readyState: v.readyState, networkState: v.networkState, duration: v.duration, error: v.error && v.error.code };
  });
  console.log("before click:", JSON.stringify(before));

  await f.click("#introVideoPlay");
  await page.waitForTimeout(3000);
  const after = await f.evaluate(() => {
    const v = document.getElementById("introVideo");
    return { currentTime: v.currentTime, paused: v.paused, muted: v.muted, readyState: v.readyState, networkState: v.networkState, duration: v.duration, error: v.error && v.error.code, w: v.videoWidth, h: v.videoHeight };
  });
  console.log("after 3s:", JSON.stringify(after));
  console.log(after.currentTime > 0 ? "RESULT: video IS playing" : "RESULT: video is NOT playing");
} finally {
  await browser.close();
  await admin.auth.admin.deleteUser(uid);
  console.log("temp account deleted");
}
