// E2E (2026-11-24) for 0072 "Report a problem": student report + limits, guest
// sign-in prompt, admin Fixed (+50 XP + thank-you, once) / Not a problem.
// Throwaway student + admin are DELETED with their reports.
// Usage: node scripts/e2e-test-reports.mjs [baseUrl]
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./env.mjs";
loadEnv();
const BASE = process.argv[2] || "https://ielts-platform-dev.vercel.app";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const fails = [];
const check = (ok, label) => { console.log(ok ? "✓" : "✗", label); if (!ok) fails.push(label); };
const stamp = Date.now();

async function mkUser(tag, role) {
  const email = `e2e-${tag}-${stamp}@example.com`, password = "E2e-" + Math.random().toString(36).slice(2) + "A1!";
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: `E2E ${tag}` } });
  if (error) throw error;
  if (role) await admin.from("profiles").update({ role }).eq("id", data.user.id);
  return { id: data.user.id, email, password };
}
async function login(ctx, u) {
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`); await page.waitForLoadState("networkidle", { timeout: 60000 });
  await page.fill('input[type="email"]', u.email); await page.fill('input[type="password"]', u.password);
  await page.click('button[type="submit"]'); await page.waitForURL(/dashboard/, { timeout: 30000 });
  return page;
}
const xpOf = async (id) => (await admin.from("profiles").select("xp").eq("id", id).single()).data.xp;
const reportsOf = async (id) => (await admin.from("test_reports").select("id, status, rewarded, category, question").eq("user_id", id).order("created_at")).data ?? [];

const { data: free } = await admin.from("tests").select("id, title").eq("tier", "free").eq("skill", "reading")
  .or("track.is.null,track.eq.regular").order("created_at").limit(6);
const student = await mkUser("report", null);
const boss = await mkUser("report-admin", "admin");
const browser = await chromium.launch({ channel: "msedge" });
try {
  // ---------- student
  const sctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await login(sctx, student);
  const dialog = () => page.getByRole("dialog");
  async function report(testId, { cat, q, msg }) {
    await page.goto(`${BASE}/reading/${testId}`); await page.waitForLoadState("load");
    await page.getByRole("button", { name: "Report a problem" }).click({ timeout: 30000 });
    await dialog().waitFor();
    await dialog().getByRole("radio", { name: cat }).click();
    if (q) await page.fill("#report-q", q);
    await page.fill("#report-msg", msg);
    await dialog().getByRole("button", { name: "Send report" }).click();
    await page.waitForFunction(() => {
      const d = document.querySelector('[role="dialog"]');
      return d && (/Thanks! We/.test(d.textContent) || d.querySelector('[role="alert"]'));
    }, null, { timeout: 30000 });
    return dialog().innerText();
  }

  let t = await report(free[0].id, { cat: "Wrong answer key", q: "14", msg: "E2E: key says B, paragraph C says otherwise." });
  check(t.includes("Thanks! We'll check it."), "student report sent, thank-you shown");
  check(!(await page.getByRole("radio", { name: "Audio problem" }).count()), "no 'Audio problem' on a reading test");
  let rows = await reportsOf(student.id);
  check(rows.length === 1 && rows[0].category === "wrong_answer" && rows[0].question === "14", "row stored (wrong_answer, Q14)");

  t = await report(free[0].id, { cat: "Something else", msg: "E2E: a second report on the same test." });
  check(/few minutes/.test(t), "2nd report on the same test within 10 min refused");

  // fill today's quota to 5 with service-role rows on other tests, then the 6th is refused
  for (const tt of free.slice(1, 5)) {
    await admin.from("test_reports").insert({ test_id: tt.id, user_id: student.id, category: "other", message: "E2E filler row" });
  }
  t = await report(free[5].id, { cat: "Page looks broken", msg: "E2E: sixth report today." });
  check(/tomorrow/.test(t), "6th report in a day refused");

  // bad input is refused client-side with a message
  await page.goto(`${BASE}/reading/${free[5].id}`); await page.waitForLoadState("load");
  await page.getByRole("button", { name: "Report a problem" }).click();
  await dialog().getByRole("button", { name: "Send report" }).click();
  check(/kind of problem/.test(await dialog().innerText()), "no category -> asked to choose one");

  // ---------- guest
  const gctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const g = await gctx.newPage();
  await g.goto(`${BASE}/reading/${free[0].id}`); await g.waitForLoadState("load");
  await g.getByRole("button", { name: "Start test" }).click();
  await g.getByRole("button", { name: "Report a problem" }).click({ timeout: 30000 });
  check((await g.getByRole("dialog").innerText()).includes("Sign in to report"), "guest gets the sign-in prompt");

  // ---------- admin
  const actx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const a = await login(actx, boss);
  rows = await reportsOf(student.id);
  const first = rows.find((r) => r.category === "wrong_answer");
  const filler = rows.find((r) => r.category === "other");
  const xp0 = await xpOf(student.id);
  await a.goto(`${BASE}/admin/reports`); await a.waitForLoadState("networkidle");
  const card = a.locator(`[data-report="${first.id}"]`);
  check(await card.count() === 1, "report listed on /admin/reports");
  check((await card.innerText()).includes("Q14"), "card shows the question number");
  await card.getByRole("button", { name: "Fixed" }).click();
  await a.getByText(/got \+50 XP/).waitFor({ timeout: 30000 });
  check((await xpOf(student.id)) === xp0 + 50, `student XP +50 (${xp0} -> ${await xpOf(student.id)})`);
  const { data: notes } = await admin.from("notifications").select("title").eq("user_id", student.id).eq("type", "report_fixed");
  check(notes?.length === 1, "one thank-you notification");

  // reopen + fix again: never paid twice
  await a.goto(`${BASE}/admin/reports?status=fixed`); await a.waitForLoadState("networkidle");
  await a.locator(`[data-report="${first.id}"]`).getByRole("button", { name: "Reopen" }).click();
  await a.getByText("Reopened.").waitFor({ timeout: 30000 });
  await a.goto(`${BASE}/admin/reports`); await a.waitForLoadState("networkidle");
  await a.locator(`[data-report="${first.id}"]`).getByRole("button", { name: "Fixed" }).click();
  await a.getByText("Marked as fixed.").waitFor({ timeout: 30000 });
  check((await xpOf(student.id)) === xp0 + 50, "fixing again after reopen pays nothing more");

  // not a problem: no XP
  await a.locator(`[data-report="${filler.id}"]`).getByRole("button", { name: "Not a problem" }).click();
  await a.getByText("Closed as not a problem.").waitFor({ timeout: 30000 });
  check((await xpOf(student.id)) === xp0 + 50, "'Not a problem' changes no XP");
  const { data: st } = await admin.from("test_reports").select("status").eq("id", filler.id).single();
  check(st.status === "dismissed", "dismissed status stored");

  // a student cannot reach the admin page
  await page.goto(`${BASE}/admin/reports`);
  await page.waitForURL((u) => !u.pathname.startsWith("/admin"), { timeout: 30000 }).catch(() => {});
  check(!new URL(page.url()).pathname.startsWith("/admin"), `student is sent away from /admin/reports (${new URL(page.url()).pathname})`);
} finally {
  await browser.close();
  await admin.from("test_reports").delete().eq("user_id", student.id);
  await admin.from("notifications").delete().eq("user_id", student.id);
  for (const u of [student, boss]) await admin.auth.admin.deleteUser(u.id);
  console.log("cleanup: users, reports, notifications deleted");
}
console.log(fails.length ? `\nFAILED: ${fails.length}` : "\nALL PASSED");
process.exit(fails.length ? 1 : 0);
