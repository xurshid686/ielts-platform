// E2E (2026-11-24): Edit profile (name + photo), owner "Remove photo", top-10
// leaderboard. Throwaway student + throwaway admin, both DELETED, with their
// avatar objects. Usage: node scripts/e2e-edit-profile.mjs [baseUrl]
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./env.mjs";
import { fileStore } from "./storage.mjs";
loadEnv();
process.env.STORAGE_BACKEND ??= "r2"; // the live site and the dev preview store avatars on R2
const BASE = process.argv[2] || "https://ielts-platform-dev.vercel.app";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const fails = [];
const check = (ok, label) => { console.log(ok ? "✓" : "✗", label); if (!ok) fails.push(label); };
const stamp = Date.now();
const pw = () => "E2e-" + Math.random().toString(36).slice(2) + "A1!";

async function mkUser(tag, role) {
  const email = `e2e-${tag}-${stamp}@example.com`, password = pw();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: `E2E ${tag}` } });
  if (error) throw error;
  if (role) await admin.from("profiles").update({ role }).eq("id", data.user.id);
  return { id: data.user.id, email, password };
}
async function login(browser, u) {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 860 } })).newPage();
  await page.goto(`${BASE}/login`); await page.waitForLoadState("networkidle");
  await page.fill('input[type="email"]', u.email); await page.fill('input[type="password"]', u.password);
  await page.click('button[type="submit"]'); await page.waitForURL(/dashboard/, { timeout: 30000 });
  await page.waitForLoadState("networkidle");
  return page;
}
const prof = async (id) => (await admin.from("profiles").select("name, avatar_url").eq("id", id).single()).data;

const student = await mkUser("editprof", null);
const boss = await mkUser("editprof-admin", "admin");
const browser = await chromium.launch({ channel: "msedge" });
try {
  const page = await login(browser, student);
  const body = () => page.evaluate(() => document.body.innerText);
  const openEdit = async () => {
    await page.locator('button[aria-haspopup="menu"]').last().click();
    await page.getByRole("button", { name: "Edit profile" }).click();
    await page.getByRole("dialog").waitFor();
  };

  // --- bad name refused
  await openEdit();
  await page.fill("#edit-first", "Ali1");
  await page.fill("#edit-last", "Valiyev");
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByRole("dialog").getByRole("alert").waitFor({ timeout: 5000 });
  check((await page.getByRole("dialog").getByRole("alert").innerText()).includes("letters"), "digits in a name refused with a message");
  await page.fill("#edit-first", "A");
  await page.getByRole("button", { name: "Save" }).click();
  check((await page.getByRole("dialog").getByRole("alert").innerText()).includes("at least"), "1-letter name refused");

  // --- good name, lowercase -> title case
  await page.fill("#edit-first", "oʻktam");
  await page.fill("#edit-last", "valiyev");
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByRole("dialog").waitFor({ state: "detached", timeout: 30000 });
  check((await prof(student.id)).name === "Oʻktam Valiyev", `name saved as "Oʻktam Valiyev" (${(await prof(student.id)).name})`);
  await page.reload(); await page.waitForLoadState("networkidle");
  await page.locator('button[aria-haspopup="menu"]').last().click();
  check((await body()).includes("Oʻktam Valiyev"), "header menu shows the new name");
  await page.keyboard.press("Escape");

  // --- photo upload (a non-square PNG: a screenshot of the page itself)
  const png = await page.screenshot();
  await openEdit();
  await page.locator('input[type="file"]').setInputFiles({ name: "me.png", mimeType: "image/png", buffer: png });
  await page.getByText("Photo updated.").waitFor({ timeout: 30000 });
  const url = (await prof(student.id)).avatar_url;
  check(/^\/api\/avatar\/[0-9a-f-]{36}\?v=/.test(url ?? ""), `avatar_url points at the route (${url})`);
  const r = await page.request.get(`${BASE}${url}`);
  check(r.status() === 200 && /image\/(webp|jpeg)/.test(r.headers()["content-type"] ?? ""), `photo served ${r.status()} ${r.headers()["content-type"]}`);
  check((await r.body()).length < 300 * 1024, `photo is small (${(await r.body()).length} bytes)`);
  check((r.headers()["cache-control"] ?? "").includes("immutable"), "versioned photo is cacheable");
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.reload(); await page.waitForLoadState("networkidle");
  const headerImgOk = await page.evaluate(() => {
    const img = document.querySelector('header button[aria-haspopup="menu"] img');
    return !!img && img.complete && img.naturalWidth === 256;
  });
  check(headerImgOk, "header shows the uploaded 256px photo");
  await page.goto(`${BASE}/u/${student.id}`); await page.waitForLoadState("load"); await page.waitForTimeout(1500);
  check(await page.evaluate((u) => [...document.images].some((i) => i.getAttribute("src") === u && i.naturalWidth > 0), url), "public profile shows the photo");

  // --- remove own photo
  await page.goto(`${BASE}/dashboard`); await page.waitForLoadState("networkidle");
  await openEdit();
  await page.getByRole("button", { name: "Remove photo" }).click();
  await page.getByText("Photo removed.").waitFor({ timeout: 30000 });
  check((await prof(student.id)).avatar_url === null, "own photo removed (avatar_url null)");
  const gone = await page.request.get(`${BASE}/api/avatar/${student.id}?v=x`);
  check(gone.status() === 404, `removed photo 404s (${gone.status()})`);
  await page.getByRole("button", { name: "Cancel" }).click();

  // --- upload again, then the ADMIN removes it
  await openEdit();
  await page.locator('input[type="file"]').setInputFiles({ name: "me.png", mimeType: "image/png", buffer: png });
  await page.getByText("Photo updated.").waitFor({ timeout: 30000 });
  await page.getByRole("button", { name: "Cancel" }).click();
  const apage = await login(browser, boss);
  await apage.goto(`${BASE}/admin/members`); await apage.waitForLoadState("networkidle");
  await apage.locator('input[type="search"], input[placeholder*="earch"]').first().fill(student.email);
  await apage.keyboard.press("Enter");
  await apage.getByRole("button", { name: /Remove photo/ }).first().waitFor({ timeout: 20000 });
  await apage.getByRole("button", { name: /Remove photo/ }).first().click();
  await apage.getByText(/Removed the profile photo/).waitFor({ timeout: 20000 });
  check((await prof(student.id)).avatar_url === null, "admin Remove photo cleared it");

  // --- forged upload refused (an SVG pretending to be a photo) via the guard in uploadAvatar
  // (covered by unit tests: sniffPhotoType refuses SVG/PNG bytes)

  // --- leaderboard: top 10
  await page.goto(`${BASE}/leaderboard`); await page.waitForLoadState("load"); await page.waitForTimeout(2500);
  const shown = await page.evaluate(() => document.querySelectorAll("main ol > li").length + document.querySelectorAll("main ul.divide-y > li").length);
  check(shown === 10, `leaderboard shows 10 people (${shown})`);
} finally {
  await browser.close();
  const store = fileStore("avatars", admin);
  await store.remove([`${student.id}.img`]).catch(() => {});
  for (const u of [student, boss]) await admin.auth.admin.deleteUser(u.id);
  console.log("cleanup: both users + avatar object deleted");
}
console.log(fails.length ? `\nFAILED: ${fails.length}` : "\nALL PASSED");
process.exit(fails.length ? 1 : 0);
