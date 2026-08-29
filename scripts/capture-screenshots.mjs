// `npm run shots` — capture the marketing screenshots used on the landing page:
// the split-screen exam player mid-test, and a finished score report. Light and
// dark, four PNGs into public/shots/.
//
//   node scripts/capture-screenshots.mjs                 # against production
//   node scripts/capture-screenshots.mjs --base http://127.0.0.1:3100
//   node scripts/capture-screenshots.mjs --test <uuid>   # pin a specific test
//   node scripts/capture-screenshots.mjs --blur          # blur the passage body
//   node scripts/capture-screenshots.mjs --keep-logo     # keep the IELTS mark
//
// Requirements:
//   * SUPABASE_SERVICE_ROLE_KEY in .env.local (creates and deletes a throwaway
//     account, and reads the chosen test's answer key).
//   * playwright — resolved from C:\Users\user\node_modules, deliberately NOT a
//     dependency of this project so it never ships in the Vercel install.
//
// Two notes on how the shots are produced:
//
//   * The score report is /review/<id>, our own page — not the CDI file's
//     in-iframe result screen. It is the platform's UI in the site's own theme
//     (so light/dark come free), it needs no submit choreography, and CLAUDE.md
//     is explicit that CDI shells are not uniform: scripting a submit is
//     exactly the harness bug that doc warns about. The underlying `results`
//     row is INSERTED with the service-role client and deleted afterwards.
//   * The band on that row is derived from a plain percentage mapping, not the
//     app's own converter (this is a .mjs script and cannot import the TS). It
//     only has to look plausible in a marketing image.
//
// The throwaway account and its result row are removed in a `finally`. If that
// ever fails, the ids are printed so they can be cleaned up by hand.

import { readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "shots");

function loadEnv() {
  const env = {};
  for (const line of readFileSync(join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return env;
}

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};
const BASE = (arg("base", "https://mockonline.uz")).replace(/\/+$/, "");
// The passage is shown in full: the point of the shot is to prove the product
// is real, and a blurred passage undercuts that. Opt back in with --blur.
const BLUR = argv.includes("--blur");
const HIDE_LOGO = !argv.includes("--keep-logo");

const VIEWPORT = { width: 1440, height: 900 };
const SCALE = 1.5; // 2160×1350 — crisp on a 2× display at the ~960px it renders at

// Rough IELTS-ish mapping, good enough for a marketing image.
function bandFor(pct) {
  if (pct >= 0.95) return 9;
  if (pct >= 0.9) return 8.5;
  if (pct >= 0.85) return 8;
  if (pct >= 0.78) return 7.5;
  if (pct >= 0.7) return 7;
  if (pct >= 0.6) return 6.5;
  return 6;
}

async function shoot(browser, theme, path, prepare) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: SCALE,
    colorScheme: theme,
  });
  // next-themes has no custom storageKey, so it reads plain "theme".
  await context.addInitScript(`localStorage.setItem("theme", "${theme}")`);
  const page = await context.newPage();
  // .animate-rise / .animate-fade-in-up live inside a
  // `prefers-reduced-motion: no-preference` query, so "reduce" renders every
  // hero element at its final state instead of mid-transition.
  await page.emulateMedia({ reducedMotion: "reduce" });

  try {
    await prepare(page);
    // Bricolage/Hanken are display:swap — without this the shot catches FOUT.
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    await page.screenshot({ path });
    console.log(`  ✓ ${path.replace(ROOT, ".")}`);
  } finally {
    await context.close();
  }
}

async function main() {
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const probe = await fetch(BASE, { redirect: "manual" }).catch(() => null);
  if (!probe) throw new Error(`${BASE} is not reachable. Start a server or pass --base.`);
  console.log(`Base: ${BASE}`);

  // --- pick a test: deterministic, so re-runs capture the same thing
  let testId = arg("test");
  let test;
  {
    const { data, error } = await admin
      .from("tests")
      .select("id, title, skill, tier, track, total, answer_key")
      .eq("skill", "reading")
      .order("total", { ascending: false })
      .order("id", { ascending: true });
    if (error) throw new Error(`Could not read tests: ${error.message}`);
    const usable = (data ?? []).filter(
      (t) => (t.track ?? "regular") === "regular" && t.tier !== "premium" && (t.total ?? 0) > 0,
    );
    test = testId ? usable.find((t) => t.id === testId) : usable[0];
    if (!test) throw new Error(testId ? `Test ${testId} not found or not usable` : "No free reading test found");
    testId = test.id;
  }
  console.log(`Test:  ${test.title} (${testId}, ${test.total} questions)`);

  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  let userId = null;
  let resultId = null;
  const password = `Shots-${randomUUID()}`;
  const email = `shots+${randomUUID().slice(0, 8)}@mockonline.uz`;

  try {
    // ---------- 1. the player, as a guest (no account needed) ----------
    console.log("Player…");
    for (const theme of ["light", "dark"]) {
      await shoot(browser, theme, join(OUT, `player-${theme}.png`), async (page) => {
        await page.goto(`${BASE}/reading/${testId}`, { waitUntil: "domcontentloaded" });
        await page.getByRole("button", { name: /start test/i }).click();
        const frame = page.frameLocator("iframe");
        await frame.locator("body").waitFor({ state: "attached", timeout: 60_000 });
        await page.waitForTimeout(2500);

        // The CDI file has its OWN instructions screen with its own "Start
        // Test" button, behind the platform's launcher. Click through it or the
        // shot is just a cover page.
        const innerStart = frame.getByRole("button", { name: /start test/i });
        if (await innerStart.count()) {
          await innerStart.first().click();
          await page.waitForTimeout(2000);
        }

        // Make it look worked-on rather than untouched.
        const words = ["college", "disease", "challenge"];
        const boxes = frame.locator('input[type="text"]');
        const n = Math.min(await boxes.count(), words.length);
        for (let i = 0; i < n; i++) {
          try {
            await boxes.nth(i).fill(words[i], { timeout: 5000 });
          } catch (e) {
            console.log(`  ! could not fill answer ${i + 1}: ${e.message.slice(0, 80)}`);
          }
        }

        // The passage renders in full by default — see BLUR above.
        //
        // The IELTS wordmark is still hidden: the shell loads it from
        // Cambridge's CDN, and a registered mark in our own marketing implies
        // an affiliation this site does not have. --keep-logo overrides.
        const touched = await frame.locator("body").evaluate(
          (body, { blur, hideLogo }) => {
            let blurred = 0;
            if (blur) {
              body.querySelectorAll(".passageContent p").forEach((n) => {
                n.style.filter = "blur(3.5px)";
                n.style.userSelect = "none";
                blurred++;
              });
            }
            let logos = 0;
            if (hideLogo) {
              body.querySelectorAll("img.ielts-logo-img, img[alt='IELTS']").forEach((n) => {
                n.style.visibility = "hidden";
                logos++;
              });
            }
            return { blurred, logos };
          },
          { blur: BLUR, hideLogo: HIDE_LOGO },
        );
        console.log(`  passage paragraphs blurred: ${touched.blurred}, logos hidden: ${touched.logos}`);
      });
    }

    // ---------- 2. the score report, as a real signed-in student ----------
    console.log("Report…");
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: "Aziza R." },
    });
    if (cErr) throw new Error(`createUser: ${cErr.message}`);
    userId = created.user.id;

    // A believable attempt: right on most, wrong on two, one left blank.
    const key = test.answer_key ?? {};
    const qs = Object.keys(key).sort((a, b) => Number(a) - Number(b));
    if (!qs.length) throw new Error("Chosen test has no stored answer key");
    const answers = {};
    let raw = 0;
    qs.forEach((q, i) => {
      const accepted = Array.isArray(key[q]) ? key[q] : [key[q]];
      if (i === qs.length - 1) return; // leave the last one blank
      if (i % 7 === 3) {
        // Vary the misses — the same wrong string on every row reads as fake.
        answers[q] = ["discovery", "true", "packaging", "fisherman", "texture", "b"][
          (i / 7) | 0
        ] ?? "not given";
      } else {
        answers[q] = String(accepted[0]);
        raw++;
      }
    });
    const total = qs.length;
    const { data: res, error: rErr } = await admin
      .from("results")
      .insert({
        user_id: userId,
        test_id: testId,
        skill: "reading",
        raw,
        total,
        band: bandFor(raw / total),
        answers,
        duration_seconds: 1980,
      })
      .select("id")
      .single();
    if (rErr) throw new Error(`insert result: ${rErr.message}`);
    resultId = res.id;
    console.log(`  attempt ${raw}/${total} → band ${bandFor(raw / total)}`);

    for (const theme of ["light", "dark"]) {
      await shoot(browser, theme, join(OUT, `report-${theme}.png`), async (page) => {
        await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
        // AuthForm is a client component: clicking before React hydrates does a
        // native GET and lands back on /login?. Give hydration a moment.
        await page.waitForTimeout(1500);
        // Type selectors, not name= — this script must also work against a
        // deployment that predates the form gaining name/autocomplete attrs.
        await page.locator('input[type="email"]').first().fill(email);
        await page.locator('input[type="password"]').first().fill(password);
        await page.getByRole("button", { name: /^sign in$/i }).click();
        await page.waitForURL(/\/dashboard/, { timeout: 45_000 });
        await page.goto(`${BASE}/review/${resultId}`, { waitUntil: "networkidle" });
      });
    }
  } finally {
    await browser.close();
    if (resultId) {
      const { error } = await admin.from("results").delete().eq("id", resultId);
      console.log(error ? `! LEAKED result ${resultId}: ${error.message}` : "cleaned up result row");
    }
    if (userId) {
      const { error } = await admin.auth.admin.deleteUser(userId);
      console.log(error ? `! LEAKED user ${userId}: ${error.message}` : "cleaned up throwaway account");
    }
  }
}

main().catch((e) => {
  console.error(`\n${e.message}`);
  process.exit(1);
});
