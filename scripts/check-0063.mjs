// Check for migration 0063 (AI writing checks).
//
//   node scripts/check-0063.mjs
//
// 1. A browser cannot touch writing_ai_checks or reserve_writing_check (ANON refused).
// 2. The reservation function really enforces the monthly quota: sequentially, for
//    a repeated attempt, after a failure (refund), and under a race. It uses a
//    throwaway account and throwaway attempts and deletes them in `finally`.
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./env.mjs";

const { url, serviceKey, anonKey } = loadEnv();
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const anon = createClient(url, anonKey, { auth: { persistSession: false } });

const checks = [];
const say = (ok, label, detail = "") => checks.push({ ok, label, detail });

// ---- 1. access
{
  const { error } = await admin.from("writing_ai_checks").select("id").limit(1);
  say(!error, "service role reads writing_ai_checks", error?.message ?? "");
  const { error: e2 } = await anon.from("writing_ai_checks").select("id").limit(1);
  say(!!e2 && /permission denied|not exist|schema cache/i.test(e2.message), "anon is REFUSED on writing_ai_checks", e2?.message ?? "anon could read it — a leak");
  const { error: e3 } = await anon.from("writing_ai_checks").insert({});
  say(!!e3, "anon cannot insert into writing_ai_checks", e3?.message ?? "the insert succeeded");
  const { error: e4 } = await anon.rpc("reserve_writing_check", { p_user: randomUUID(), p_attempt: randomUUID(), p_month: "2026-11", p_limit: 10 });
  say(!!e4, "anon cannot call reserve_writing_check", e4?.message ?? "the call succeeded");
}

// ---- 2. the quota function
let userId = null;
const attemptIds = [];
try {
  const { data: q } = await admin.from("writing_practice").select("id, prompt, topic").eq("task", 2).limit(1).single();
  const created = await admin.auth.admin.createUser({
    email: `check0063-${Date.now()}@example.invalid`,
    password: randomUUID(),
    email_confirm: true,
  });
  if (created.error) throw new Error(created.error.message);
  userId = created.data.user.id;

  const mk = async () => {
    const { data, error } = await admin
      .from("writing_practice_attempts")
      .insert({ user_id: userId, practice_id: q.id, prompt: q.prompt, topic: q.topic ?? "education", answer: "x", submitted_at: new Date().toISOString() })
      .select("id")
      .single();
    if (error) throw new Error("attempt insert: " + error.message);
    attemptIds.push(data.id);
    return data.id;
  };
  const reserve = async (attempt, limit = 10, month = "2026-11") => {
    const { data, error } = await admin.rpc("reserve_writing_check", { p_user: userId, p_attempt: attempt, p_month: month, p_limit: limit });
    if (error) throw new Error("rpc: " + error.message);
    return data[0];
  };

  const a = [];
  for (let i = 0; i < 11; i++) a.push(await mk());

  const results = [];
  for (let i = 0; i < 10; i++) results.push(await reserve(a[i]));
  say(results.every((r) => r.ok) && results[9].used === 10, "10 checks are granted, the 10th reports used=10");
  const over = await reserve(a[10]);
  say(!over.ok && over.reason === "quota", "the 11th is refused with reason 'quota'", JSON.stringify(over));
  const again = await reserve(a[0]);
  say(!again.ok && again.reason === "already" && !!again.check_id, "the same attempt is refused with reason 'already'", JSON.stringify(again));

  // A failure refunds: mark one failed, then a new attempt fits and the old one can retry.
  await admin.from("writing_ai_checks").update({ status: "failed" }).eq("id", results[0].check_id);
  const afterRefund = await reserve(a[10]);
  say(afterRefund.ok, "a FAILED check is refunded (the 11th attempt now fits)", JSON.stringify(afterRefund));

  // Another month is a fresh allowance.
  const b = await mk();
  const nextMonth = await reserve(b, 10, "2026-12");
  say(nextMonth.ok && nextMonth.used === 1, "a new month starts again at 1", JSON.stringify(nextMonth));

  // A stale pending row (cut-off request) stops counting.
  await admin.from("writing_ai_checks").update({ created_at: new Date(Date.now() - 10 * 60_000).toISOString() }).eq("id", afterRefund.check_id);
  const stale = await reserve(await mk(), 10, "2026-11");
  const { data: marked } = await admin.from("writing_ai_checks").select("status").eq("id", afterRefund.check_id).single();
  say(marked.status === "failed" && stale.ok, "a pending row older than 3 min is expired and frees its check", `${marked.status} / ${JSON.stringify(stale)}`);

  // The race: 5 parallel reservations with a limit of 3 on a clean month => exactly 3 ok.
  const raceAttempts = [];
  for (let i = 0; i < 5; i++) raceAttempts.push(await mk());
  const raced = await Promise.all(raceAttempts.map((id) => reserve(id, 3, "2027-01")));
  say(raced.filter((r) => r.ok).length === 3, "5 parallel requests with limit 3 grant exactly 3", raced.map((r) => (r.ok ? "ok" : r.reason)).join(","));
} catch (e) {
  say(false, "quota function checks ran", e.message);
} finally {
  if (userId) {
    await admin.from("writing_ai_checks").delete().eq("user_id", userId);
    if (attemptIds.length) await admin.from("writing_practice_attempts").delete().in("id", attemptIds);
    await admin.auth.admin.deleteUser(userId);
  }
}

let bad = 0;
for (const c of checks) {
  if (!c.ok) bad++;
  console.log(`${c.ok ? "✅" : "❌"}  ${c.label}${c.detail ? `  — ${c.detail}` : ""}`);
}
process.exitCode = bad ? 1 : 0;
