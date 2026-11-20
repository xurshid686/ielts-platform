// Burst test for the teacher bot webhook.
//
//   node scripts/burst-test-teacher-bot.mjs --host=https://ielts-platform-dev.vercel.app [--n=30] [--repeats=5]
//
// Fires N simulated Telegram updates at once (distinct update ids, each asking for a different
// test's PDF) as the OWNER's chat, then REPEATS some update ids. Expectations:
//   * every POST answers 200 quickly (the work happens after the response);
//   * the bot sends exactly N documents + N blurred-answer messages (2N messages) and the repeated
//     update ids add nothing.
// The count is measured from Telegram message ids: a probe message is sent before and after, and
// the bot's messages in a private chat are numbered consecutively, so delta - 1 = messages sent.
// This sends ~2N messages to the owner's chat. It links the owner's chat to the owner's admin
// account first if it is not linked already (the same row the site button creates).
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./env.mjs";

const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const host = arg("host");
const N = Number(arg("n") ?? 30);
const REPEATS = Number(arg("repeats") ?? 5);
if (!host) throw new Error("--host is required");

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const get = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim().replace(/^["']|["']$/g, "");
const TOKEN = get("TELEGRAM_TEACHER_BOT_TOKEN");
const SECRET = get("TELEGRAM_TEACHER_WEBHOOK_SECRET");
const OWNER = Number(get("TELEGRAM_OWNER_ID"));
const API = `https://api.telegram.org/bot${TOKEN}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tg = async (m, b) => (await fetch(`${API}/${m}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) })).json();

const { url, serviceKey } = loadEnv({ quiet: true });
const sb = createClient(url, serviceKey, { auth: { persistSession: false } });

// the owner's admin account must be linked to this chat
const { data: admin } = await sb.from("profiles").select("id").eq("role", "admin").eq("is_owner", true).limit(1).maybeSingle();
if (!admin) throw new Error("no owner profile found");
const { data: link } = await sb.from("teacher_bot_links").select("chat_id").eq("user_id", admin.id).maybeSingle();
if (!link) {
  await sb.from("teacher_bot_links").delete().eq("chat_id", OWNER);
  const { error } = await sb.from("teacher_bot_links").upsert({ user_id: admin.id, chat_id: OWNER });
  if (error) throw new Error(error.message);
  console.log("linked the owner's chat to the owner's account");
}

const { data: pdfs } = await sb.from("test_pdfs").select("test_id, tg_file_id").not("tg_file_id", "is", null).limit(N);
if (pdfs.length < N) throw new Error(`only ${pdfs.length} cached PDFs available`);

const probe = async (label) => {
  const r = await tg("sendMessage", { chat_id: OWNER, text: `burst-test marker: ${label}` });
  return r.result.message_id;
};

const base = 8_000_000_000 + Math.floor(Date.now() / 1000);
const post = (i, testId) =>
  fetch(`${host}/api/telegram-teacher`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": SECRET },
    body: JSON.stringify({ update_id: base + i, message: { message_id: i, chat: { id: OWNER, type: "private" }, from: { id: OWNER }, text: `/start pdf_${testId}` } }),
  });

const before = await probe("before");
const t0 = Date.now();
const first = await Promise.all(pdfs.map((p, i) => post(i, p.test_id).then((r) => ({ status: r.status, ms: Date.now() - t0 }))));
console.log(`first wave: ${first.filter((r) => r.status === 200).length}/${N} answered 200, slowest ${Math.max(...first.map((r) => r.ms))} ms`);
// repeats of update ids already seen: must add nothing
const rep = await Promise.all(pdfs.slice(0, REPEATS).map((p, i) => post(i, p.test_id).then((r) => r.json())));
console.log(`repeats: ${rep.filter((j) => j.deduped).length}/${REPEATS} reported as deduplicated`);

// let the sends finish, then close with a marker: the bot's messages in a private chat are numbered
// consecutively, so (closing id - opening id - 1) = messages the bot sent in between
await sleep(75_000);
let closing = await probe("after");
let count = closing - before - 1;
if (count < 2 * N) {
  await sleep(60_000);
  closing = await probe("after (second look)");
  count = closing - before - 2;
}
const verdict = count === 2 * N ? "PASS" : "CHECK";
console.log(`${verdict}: the bot sent ${count} messages for ${N} requests (expected ${2 * N}: a PDF and a blurred-answers reply each; repeats add none)`);
