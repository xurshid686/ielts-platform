// Send every registered reading-test PDF to the owner's Telegram chat through the TEACHER bot.
//
//   node scripts/send-all-pdfs.mjs [--answers] [--limit=N] [--resume=<progress.json>]
//
// --answers: after each PDF, a reply with the answers inside a Telegram SPOILER (written, but
// blurred until tapped). The PDF itself never carries answers.
//
// The owner must have pressed Start on the teacher bot once (a bot cannot open a chat).
// Paced to ~1 message/second, retries on Telegram's 429 "retry after", and stores each file's
// Telegram file_id in test_pdfs.tg_file_id, so this run also pre-warms the cache the bot uses for
// later requests. A file Telegram already holds is re-sent by file_id: no download, no upload.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./env.mjs";
import { fileStore } from "./storage.mjs";

const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const WITH_ANSWERS = process.argv.includes("--answers");
const { url, serviceKey } = loadEnv({ quiet: true });
const envText = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const getEnv = (k) => (envText.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim().replace(/^["']|["']$/g, "");
const TOKEN = process.env.TELEGRAM_TEACHER_BOT_TOKEN || getEnv("TELEGRAM_TEACHER_BOT_TOKEN");
const CHAT = process.env.TELEGRAM_OWNER_ID || getEnv("TELEGRAM_OWNER_ID");
if (!TOKEN || !CHAT) throw new Error("Missing TELEGRAM_TEACHER_BOT_TOKEN or TELEGRAM_OWNER_ID");
const API = `https://api.telegram.org/bot${TOKEN}`;

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const progressFile = arg("resume") || "send-progress.json";
const done = new Set(existsSync(progressFile) ? JSON.parse(readFileSync(progressFile, "utf8")) : []);

// Same formatting as src/lib/telegram/answers-text.ts (kept in step by hand: this is a script).
const WORDS = new Set(["true", "false", "not given", "yes", "no"]);
const showAns = (a) => {
  const t = a.trim();
  return WORDS.has(t.toLowerCase()) || /^[a-k]$/i.test(t) ? t.toUpperCase() : t;
};
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function answerMessage(title, key) {
  if (!key) return null;
  const lines = Object.keys(key)
    .map((k) => ({ k, n: Number(k.replace(/^q/i, "")) }))
    .filter((x) => Number.isFinite(x.n))
    .sort((a, b) => a.n - b.n)
    .map(({ k, n }) => {
      const list = (Array.isArray(key[k]) ? key[k] : [key[k]]).filter((v) => typeof v === "string" && v.trim());
      return `${n}   ${list.map(showAns).join(" / ")}`;
    });
  return lines.length ? `<b>Answers · ${esc(title)}</b>\n<tg-spoiler>${esc(lines.join("\n"))}</tg-spoiler>` : null;
}

async function tg(method, body) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(`${API}/${method}`, {
      method: "POST",
      ...(body instanceof FormData ? { body } : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    });
    const j = await res.json();
    if (j.ok) return j.result;
    if (res.status === 429) {
      const wait = (j.parameters?.retry_after ?? 5) + 1;
      console.log(`  rate limited, waiting ${wait}s`);
      await sleep(wait * 1000);
      continue;
    }
    throw new Error(j.description || `HTTP ${res.status}`);
  }
  throw new Error("gave up after repeated rate limits");
}

const { data: rows } = await supabase.from("test_pdfs").select("test_id, pages, bytes, tg_file_id");
const { data: tests } = await supabase.from("tests").select("id, title, kind, skill, answer_key").eq("skill", "reading");
const meta = new Map(tests.map((t) => [t.id, t]));
const list = rows
  .filter((r) => meta.has(r.test_id)) // reading tests only
  .map((r) => ({ ...r, ...meta.get(r.test_id) }))
  .sort((a, b) => a.title.localeCompare(b.title));
const limit = arg("limit") ? Number(arg("limit")) : list.length;
const total = Math.min(limit, list.length);
console.log(`${total} PDFs to send${WITH_ANSWERS ? " with blurred answers" : ""} (${done.size} already sent in earlier runs)`);

let sent = 0;
const failed = [];
for (let i = 0; i < total; i++) {
  const t = list[i];
  if (done.has(t.test_id)) continue;
  try {
    const label = `${t.kind === "full" ? "Full test" : "Passage"} · ${t.pages} pages`;
    const caption = `${i + 1}/${list.length}  ${t.title}\n${label}`.slice(0, 1000);
    let result;
    if (t.tg_file_id) {
      result = await tg("sendDocument", { chat_id: CHAT, document: t.tg_file_id, caption });
    } else {
      const { data } = await fileStore("papers", supabase).download(`${t.test_id}.pdf`);
      if (!data) throw new Error("file missing in storage");
      const form = new FormData();
      form.set("chat_id", CHAT);
      form.set("caption", caption);
      const fname = `${t.title.replace(/[^\w\- ]+/g, "").trim().slice(0, 70) || "IELTS Reading"}.pdf`;
      form.set("document", new Blob([new Uint8Array(await data.arrayBuffer())], { type: "application/pdf" }), fname);
      result = await tg("sendDocument", form);
      const fileId = result?.document?.file_id;
      if (fileId) await supabase.from("test_pdfs").update({ tg_file_id: fileId }).eq("test_id", t.test_id);
    }
    if (WITH_ANSWERS) {
      const msg = answerMessage(t.title, t.answer_key);
      if (msg) {
        await sleep(1100);
        await tg("sendMessage", {
          chat_id: CHAT,
          text: msg,
          parse_mode: "HTML",
          reply_parameters: { message_id: result.message_id, allow_sending_without_reply: true },
        });
      }
    }
    done.add(t.test_id);
    sent++;
    writeFileSync(progressFile, JSON.stringify([...done]));
    if (sent % 25 === 0) console.log(`sent ${sent} (${i + 1}/${total})`);
  } catch (e) {
    console.log(`FAILED ${t.title}: ${e.message}`);
    failed.push(`${t.title}: ${e.message}`);
  }
  await sleep(1100);
}
const summary = `Done. ${sent} sent this run${WITH_ANSWERS ? " (each with blurred answers)" : ""}, ${done.size} in total${failed.length ? `, ${failed.length} failed` : ""}.`;
console.log(summary);
if (failed.length) console.log(failed.join("\n"));
await tg("sendMessage", { chat_id: CHAT, text: summary + (failed.length ? `\nFailed:\n${failed.slice(0, 15).join("\n")}` : "") });
