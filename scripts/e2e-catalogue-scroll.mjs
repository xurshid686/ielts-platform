// E2E (2026-11-28): the catalogue loads more cards by itself while scrolling (no "Show more"
// clicks), keeps the student's place on Back, and offers "Back to top". Guest only; creates
// nothing. Usage: node scripts/e2e-catalogue-scroll.mjs [baseUrl]
import { chromium } from "playwright";

const BASE = (process.argv[2] || "https://ielts-platform-dev.vercel.app").replace(/\/+$/, "");
const fails = [];
const check = (ok, label) => { console.log(ok ? "✓" : "✗", label); if (!ok) fails.push(label); };
const cards = (p) => p.locator("[data-catalogue-grid] > a").count();

async function scrollToEnd(p, maxRounds = 40) {
  const seen = [];
  for (let i = 0; i < maxRounds; i++) {
    seen.push(await cards(p));
    if (await p.locator("[data-catalogue-end]").count()) break;
    await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await p.waitForTimeout(450);
  }
  seen.push(await cards(p));
  return seen;
}

const browser = await chromium.launch({ channel: "msedge" });
try {
  // The server HTML (no JavaScript) still draws only the first 24 cards.
  {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/reading`, { waitUntil: "domcontentloaded" });
    check((await cards(p)) === 24, `server HTML has 24 cards (${await cards(p)})`);
    await ctx.close();
  }

  for (const [skill, w] of [["reading", 1280], ["listening", 1280], ["reading", 375]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: w === 375 ? 740 : 900 } });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/${skill}`); await p.waitForLoadState("networkidle");
    const first = await cards(p);
    const seen = await scrollToEnd(p);
    const last = seen[seen.length - 1];
    const endText = await p.locator("[data-catalogue-end]").innerText().catch(() => "");
    const total = Number((endText.match(/All (\d+)/) ?? [])[1] ?? 0);
    check(first === 24 || (first < 24 && !endText), `${skill} @${w}: starts at ${first} cards`);
    check(last > first && last === total, `${skill} @${w}: scrolling alone loads everything (${first} → ${last} of ${total}, steps ${[...new Set(seen)].join(",")})`);
    check(!(await p.getByRole("button", { name: /^Show \d+ more/ }).count()), `${skill} @${w}: no 'Show more' button to click`);
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(overflow <= 0, `${skill} @${w}: no sideways scroll`);
    const top = p.getByRole("button", { name: "Back to top" });
    check(await top.isVisible(), `${skill} @${w}: 'Back to top' shows far down`);
    await top.click(); await p.waitForTimeout(900);
    check((await p.evaluate(() => window.scrollY)) < 200, `${skill} @${w}: 'Back to top' returns to the filters`);

    if (skill === "reading" && w === 1280) {
      // Search resets to the first matches; clearing it gives back the first step.
      await p.fill('input[placeholder="Search by title…"]', "the");
      await p.waitForTimeout(400);
      const searched = await cards(p);
      check(searched > 0 && searched <= 24, `search shows its first ${searched} matches`);
      await p.fill('input[placeholder="Search by title…"]', "");
      await p.waitForTimeout(400);
      check((await cards(p)) === 24, "clearing the search shows the first 24 again");

      // Back from a test lands at the same card.
      while ((await cards(p)) < 72) {
        await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await p.waitForTimeout(400);
      }
      const card = p.locator("[data-catalogue-grid] > a").nth(60);
      await card.scrollIntoViewIfNeeded();
      const href = await card.getAttribute("href");
      await card.click();
      await p.waitForURL((u) => u.pathname === href, { timeout: 30000 });
      await p.goBack();
      await p.waitForURL(/\/reading$/, { timeout: 30000 });
      await p.waitForTimeout(1500);
      const back = p.locator(`[data-catalogue-grid] > a[href="${href}"]`);
      const inView = await back.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return r.bottom > 0 && r.top < window.innerHeight;
      }).catch(() => false);
      check(inView, "Back from a test lands on the same card (#61)");
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(fails.length ? `\n${fails.length} FAILED` : "\nALL PASSED");
process.exit(fails.length ? 1 : 0);
