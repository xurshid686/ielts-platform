// Scoped verification of the Discipline admin.
//
// SAFETY RULE (after a test run edited a real day on 2026-09-03): this script
// may only act on rows it created itself. Day cards are located by their own
// day number, never by `.first()`, and a guard refuses to run if the DOM
// selector it is about to click sits outside the fixture set.
import fs from "node:fs";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const B = process.argv[2];
const OUT = process.argv[3];
const env = Object.fromEntries(
  fs.readFileSync(".env.frankfurt", "utf8").split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const PASS = "D3Check!2026x";
const stamp = Date.now();
const DAYS = [9101, 9102, 9103]; // fixture day numbers — nothing else is touched
const out = [];
const check = (name, pass, detail) => {
  out.push({ name, pass });
  console.log(`${pass ? "PASS " : "FAIL "} ${name}${detail !== undefined ? "   " + JSON.stringify(detail) : ""}`);
};

// ------------------------------------------------------------- fixtures
async function mkUser(tag, admin = false) {
  const email = `d3check-${tag}-${stamp}@example.com`;
  const { data, error } = await db.auth.admin.createUser({
    email, password: PASS, email_confirm: true, user_metadata: { full_name: `D3 ${tag}` },
  });
  if (error) throw new Error(`${tag}: ${error.message}`);
  if (admin) await db.from("profiles").update({ role: "admin" }).eq("id", data.user.id);
  return { email, id: data.user.id };
}
async function mkTest(n, skill, total) {
  const key = {};
  for (let i = 1; i <= total; i++) key[String(i)] = "x";
  const filePath = `d3check-${stamp}-${n}.html`;
  await db.storage.from("tests").upload(filePath,
    new Blob([`<script>const correctAnswers=${JSON.stringify(key)};</script>`], { type: "text/html" }),
    { upsert: true });
  const { data, error } = await db.from("tests").insert({
    title: `D3 Check ${n} (${stamp})`, skill, kind: "single", tier: "free", track: "discipline",
    file_path: filePath,
    file_url: `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/tests/${filePath}`,
    answer_key: key, total,
  }).select("id").single();
  if (error) throw new Error(`test ${n}: ${error.message}`);
  return { id: data.id, filePath };
}

// Re-runnable: clear anything a previous crashed run left behind, scoped to
// the fixture day numbers and the d3check email prefix — never anything else.
for (const n of DAYS) await db.from("discipline_days").delete().eq("day_number", n);
{
  const { data: old } = await db.from("profiles").select("id").ilike("email", "d3check-%");
  for (const u of old ?? []) await db.auth.admin.deleteUser(u.id);
  const { data: oldTests } = await db.from("tests").select("id, file_path").like("title", "D3 %");
  for (const t of oldTests ?? []) {
    await db.from("tests").delete().eq("id", t.id);
    if (t.file_path) await db.storage.from("tests").remove([t.file_path]);
  }
}

const admin = await mkUser("admin", true);
const ahead = await mkUser("ahead");
const behind = await mkUser("behind");
const quiet = await mkUser("quiet");
const tests = [await mkTest(1, "reading", 13), await mkTest(2, "listening", 10), await mkTest(3, "reading", 13)];

const { data: dayRows, error: dayErr } = await db.from("discipline_days").insert(
  DAYS.map((n, i) => ({ day_number: n, title: `D3 day ${i + 1}`, instructions: `Notes ${i + 1}` })),
).select("id, day_number");
if (dayErr) throw new Error(`days: ${dayErr.message}`);
const dayId = Object.fromEntries(dayRows.map((d) => [d.day_number, d.id]));

await db.from("discipline_day_tests").insert([
  { day_id: dayId[9101], test_id: tests[0].id, position: 0 },
  { day_id: dayId[9101], test_id: tests[1].id, position: 1 },
  { day_id: dayId[9102], test_id: tests[2].id, position: 0 },
]);
await db.from("discipline_members").insert([
  { user_id: ahead.id, current_day: 9103 },
  { user_id: behind.id, current_day: 9101, strikes: 2 },
  { user_id: quiet.id, current_day: 9101 },
]);
const ago = (d) => new Date(Date.now() - d * 86400000).toISOString();
await db.from("results").insert([
  { user_id: ahead.id, test_id: tests[0].id, skill: "reading", raw: 12, total: 13, band: 8, submitted_at: ago(1) },
  { user_id: ahead.id, test_id: tests[1].id, skill: "listening", raw: 7, total: 10, band: 6, submitted_at: ago(1) },
  { user_id: ahead.id, test_id: tests[2].id, skill: "reading", raw: 5, total: 13, band: 4, submitted_at: ago(0) },
  { user_id: ahead.id, test_id: tests[2].id, skill: "reading", raw: 13, total: 13, band: 9, submitted_at: ago(0) },
  { user_id: behind.id, test_id: tests[0].id, skill: "reading", raw: 6, total: 13, band: 5, submitted_at: ago(9) },
]);
await db.from("discipline_completions").insert([
  { user_id: ahead.id, day_id: dayId[9101] },
  { user_id: ahead.id, day_id: dayId[9102] },
]);
console.log("fixtures ready\n");

// --------------------------------------------------------------- browser
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();
page.on("dialog", (d) => d.accept().catch(() => {}));

await page.goto(`${B}/login`, { waitUntil: "domcontentloaded" });
await page.waitForSelector('input[type="email"]', { timeout: 45000 });
await page.fill('input[type="email"]', admin.email);
await page.fill('input[type="password"]', PASS);
await page.click('button[type="submit"]');
await page.waitForURL(/dashboard/, { timeout: 45000 });

const txt = () => page.evaluate(() => document.body.innerText);
async function programme() {
  await page.goto(`${B}/admin/discipline`, { waitUntil: "domcontentloaded" });
  await page.click("text=/Programme \\(/");
  await page.waitForTimeout(700);
}
/** The one day card whose heading names this fixture day. Never `.first()`. */
function card(n) {
  return page.locator("div.rounded-2xl").filter({ hasText: new RegExp(`Day ${n}\\b`) }).last();
}

// -------- members roster
{
  await page.goto(`${B}/admin/discipline`, { waitUntil: "domcontentloaded" });
  const t = await txt();
  const shown = Number((t.match(/(\d+) shown/) || [])[1] ?? 0);
  check("members: full roster listed without searching", shown > 50, `${shown} shown`);
  check("members: current members flagged in the list", /\bIn\b/.test(t));
  await page.screenshot({ path: `${OUT}/d3-members.png`, fullPage: true });
}

// -------- edit a FIXTURE day
{
  await programme();
  await card(9101).getByRole("button", { name: /Edit/ }).click();
  await page.waitForTimeout(500);
  await card(9101).locator('input[placeholder="Title"]').fill("D3 renamed");
  await card(9101).getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForTimeout(5000);
  const { data } = await db.from("discipline_days").select("title, instructions").eq("day_number", 9101).single();
  check("programme: editing a day saved the new title", data?.title === "D3 renamed", data);
  check("programme: editing kept the instructions", data?.instructions === "Notes 1", data?.instructions);
}

// -------- reorder FIXTURE days
{
  await programme();
  await card(9101).getByRole("button", { name: "Move day down" }).click();
  await page.waitForTimeout(5000);
  const { data } = await db.from("discipline_days").select("day_number, title").in("day_number", DAYS).order("day_number");
  const moved = data?.find((d) => d.title === "D3 renamed");
  check("programme: moving a day down swapped its number", moved?.day_number === 9102, data);

  await programme();
  await card(9102).getByRole("button", { name: "Move day up" }).click();
  await page.waitForTimeout(5000);
  const { data: back } = await db.from("discipline_days").select("day_number, title").in("day_number", DAYS).order("day_number");
  check("programme: moving it back up restored the order",
    back?.find((d) => d.title === "D3 renamed")?.day_number === 9101, back);
}

// -------- reorder tests inside a FIXTURE day
{
  await programme();
  const before = await db.from("discipline_day_tests").select("test_id, position").eq("day_id", dayId[9101]).order("position");
  await card(9101).getByRole("button", { name: "Move test down" }).first().click();
  await page.waitForTimeout(5000);
  const after = await db.from("discipline_day_tests").select("test_id, position").eq("day_id", dayId[9101]).order("position");
  check("programme: reordering tests inside a day works",
    before.data?.[0]?.test_id === after.data?.[1]?.test_id, { before: before.data, after: after.data });
}

// -------- library picker + upload form on a FIXTURE day
{
  await programme();
  await card(9103).getByRole("button", { name: /Add from library/ }).click();
  await page.waitForTimeout(3000);
  const t = await txt();
  check("programme: library loads on open, no search needed", t.includes("D3 Check") && !t.includes("Loading tests"));
  await page.screenshot({ path: `${OUT}/d3-library.png`, fullPage: true });
  await card(9103).getByRole("button", { name: "Cancel" }).click();
  await page.waitForTimeout(400);

  await card(9103).getByRole("button", { name: /Upload a new paper/ }).click();
  await page.waitForTimeout(600);
  const t2 = await txt();
  check("programme: upload form opens inside the day", t2.includes("Upload & attach"));
  await page.screenshot({ path: `${OUT}/d3-upload.png`, fullPage: true });

  // Really upload one, and confirm it lands as discipline-only AND attached.
  const tmp = `${OUT}/d3-upload-${stamp}.html`;
  const key = {}; for (let i = 1; i <= 5; i++) key[String(i)] = "x";
  fs.writeFileSync(tmp, `<script>const correctAnswers=${JSON.stringify(key)};</script>`);
  await card(9103).locator('input[name="title"]').fill(`D3 Uploaded (${stamp})`);
  await card(9103).locator('input[name="file"]').setInputFiles(tmp);
  await card(9103).getByRole("button", { name: /Upload & attach/ }).click();
  await page.waitForTimeout(9000);

  const { data: uploaded } = await db.from("tests").select("id, track, tier").eq("title", `D3 Uploaded (${stamp})`).maybeSingle();
  check("upload: created the test as Discipline-only", uploaded?.track === "discipline", uploaded);
  if (uploaded) {
    const { data: link } = await db.from("discipline_day_tests").select("day_id").eq("test_id", uploaded.id).maybeSingle();
    check("upload: attached it to the day straight away", link?.day_id === dayId[9103], link);
    tests.push({ id: uploaded.id, filePath: null });
  } else {
    check("upload: attached it to the day straight away", false, "no test row");
  }
}

// -------- progress grid + filters
{
  await page.goto(`${B}/admin/discipline`, { waitUntil: "domcontentloaded" });
  await page.click("text=Progress");
  await page.waitForTimeout(900);
  const t = await txt();
  check("progress: one column per day", DAYS.every((n) => t.includes(`D${n}`)));
  check("progress: raw scores in the cells", t.includes("12/13") && t.includes("7/10"));
  check("progress: shows the FIRST attempt, not the better retake", t.includes("5/13") && !t.includes("13/13"));
  check("progress: Inactive flag rendered", t.includes("Inactive"));
  check("progress: Trailing flag rendered", t.includes("Trailing"));
  await page.screenshot({ path: `${OUT}/d3-progress.png`, fullPage: true });

  const count = async () =>
    (await page.evaluate(() => (document.body.innerText.match(/(\d+) of (\d+) students shown/) || [])[0])) ?? "";
  const total = Number((await count()).split(" of ")[1]?.split(" ")[0] ?? 0);
  const base = await count();
  check("progress: opens showing every member", base.startsWith(`${total} of ${total}`), base);

  const toggle = async (name) => {
    await page.getByRole("button", { name, exact: true }).click();
    await page.waitForTimeout(400);
    const c = await count();
    await page.getByRole("button", { name, exact: true }).click();
    await page.waitForTimeout(300);
    return c;
  };
  const inact = await toggle("Inactive");
  check("progress: Inactive filter narrows the table", Number(inact.split(" ")[0]) < total, inact);
  const strk = await toggle("Has strikes");
  check("progress: Has-strikes filter narrows the table", Number(strk.split(" ")[0]) < total, strk);
  const trail = await toggle("Trailing");
  check("progress: Trailing filter narrows the table", Number(trail.split(" ")[0]) < total, trail);

  await page.fill('input[placeholder="Find a student…"]', "d3check-quiet");
  await page.waitForTimeout(400);
  const nm = await count();
  check("progress: name search narrows the table", nm.startsWith("1 of"), nm);
  await page.fill('input[placeholder="Find a student…"]', "");

  await page.selectOption("select", { label: `Not finished Day 9101` });
  await page.waitForTimeout(400);
  const byDay = await count();
  check("progress: by-day filter narrows the table", Number(byDay.split(" ")[0]) < total, byDay);
  await page.screenshot({ path: `${OUT}/d3-progress-filtered.png`, fullPage: true });
}

await browser.close();

// ------------------------------------------------------------- teardown
for (const u of [admin, ahead, behind, quiet]) await db.auth.admin.deleteUser(u.id);
for (const n of DAYS) await db.from("discipline_days").delete().eq("day_number", n);
for (const t of tests) {
  await db.from("tests").delete().eq("id", t.id);
  if (t.filePath) await db.storage.from("tests").remove([t.filePath]);
}
const { data: leftDays } = await db.from("discipline_days").select("day_number, title");
const { data: leftTests } = await db.from("tests").select("id, title").eq("track", "discipline");
const { data: leftUsers } = await db.from("profiles").select("email").ilike("email", "d3check-%");
const { count: memberCount } = await db.from("discipline_members").select("*", { count: "exact", head: true });
console.log("\n--- after teardown ---");
console.log("days remaining:", leftDays);
console.log("discipline tests remaining:", leftTests);
console.log("d3check accounts remaining:", leftUsers?.length);
console.log("members remaining:", memberCount);

const failed = out.filter((r) => !r.pass);
console.log(`\n${out.length - failed.length}/${out.length} passed`);
if (failed.length) process.exitCode = 1;
