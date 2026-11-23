// Screenshots for the "free test of the day" posts: each post's FREE test,
// opened as a guest on the live site, in the real exam screen.
//
//   node scripts/channel-shots.mjs docs/growth/channel-posts-2026-11-24.md
//
// Writes docs/growth/shots/<YYYY-MM-DD>.png. A guest attempt persists nothing
// (/api/guest-grade), so this moves no counter. The IELTS wordmark is hidden,
// as in scripts/capture-screenshots.mjs (a registered mark in our own
// marketing implies an affiliation the site does not have).
import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";

const file = process.argv[2];
if (!file) throw new Error("usage: channel-shots.mjs <posts.md>");
const md = readFileSync(file, "utf8");
const MONTHS = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06", Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" };
const year = (/(\d{4})/.exec(file) || [])[1];
const posts = md
  .replace(/\r\n/g, "\n")
  .split(/\n---\s*\n/)
  .map((b) => /^## \w+ (\d{1,2}) (\w{3})[^\n]*\n([\s\S]*)$/m.exec(b))
  .filter(Boolean)
  .map((m) => ({
  date: `${year}-${MONTHS[m[2]]}-${m[1].padStart(2, "0")}`,
  url: (/https:\/\/mockonline\.uz\/(?:reading|listening)\/[0-9a-f-]{36}/.exec(m[3]) || [])[0],
}));
const outDir = new URL("../docs/growth/shots/", import.meta.url);
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ channel: "msedge" });
try {
  for (const p of posts) {
    if (!p.url) { console.log(`✗ ${p.date}: no test link`); continue; }
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 760 }, deviceScaleFactor: 1.5, colorScheme: "light" });
    await ctx.addInitScript(`localStorage.setItem("theme", "light")`);
    const page = await ctx.newPage();
    try {
      await page.goto(p.url, { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: /start test/i }).first().click();
      const frame = page.frameLocator("iframe");
      await frame.locator("body").waitFor({ state: "attached", timeout: 60_000 });
      await page.waitForTimeout(2500);
      const inner = frame.getByRole("button", { name: /^start test$/i });
      if (await inner.count()) { await inner.first().click(); await page.waitForTimeout(2000); }
      for (const sel of [".mode-card.practice", ".mode-card"]) {
        const card = frame.locator(sel);
        if (await card.count()) { await card.first().click(); await page.waitForTimeout(2000); break; }
      }
      await frame.locator("body").evaluate((body) => {
        body.querySelectorAll("img.ielts-logo-img, img[alt='IELTS']").forEach((n) => { n.style.visibility = "hidden"; });
      });
      await page.waitForTimeout(800);
      const path = new URL(`${p.date}.png`, outDir);
      await page.screenshot({ path: path.pathname.replace(/^\/([A-Z]:)/, "$1") });
      console.log(`✓ ${p.date}`);
    } catch (e) {
      console.log(`✗ ${p.date}: ${e.message.split("\n")[0]}`);
    } finally {
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}
