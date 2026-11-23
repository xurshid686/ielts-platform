// "Free test of the day" channel posts (docs/growth/channel-posts-*.md).
//
//   node scripts/channel-post.mjs <file> --preview
//       Sends every post to the OWNER only, through the admin bot
//       (TELEGRAM_BOT_TOKEN -> TELEGRAM_OWNER_ID), so they can be read exactly
//       as they will look. Nothing reaches the channel.
//
//   node scripts/channel-post.mjs <file> --send <YYYY-MM-DD> [--channel @ReadinMarathons]
//       Posts that day's post to the channel through @MockOnlineMaterials_bot
//       (TELEGRAM_TEACHER_BOT_TOKEN). ONLY for a batch the owner approved; the
//       message id is appended to docs/growth/posted.log.
//
// A post is the text between a "## <Day> <D> <Mon>: …" heading and the next "---".
import { readFileSync, appendFileSync, existsSync } from "node:fs";
import { loadEnv } from "./env.mjs";

loadEnv({ quiet: true });
const local = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]),
);
const env = (k) => process.env[k] || local[k];

const [file, mode, arg] = process.argv.slice(2);
if (!file || !["--preview", "--send"].includes(mode)) {
  console.error("usage: channel-post.mjs <file> --preview | --send <YYYY-MM-DD> [--channel @x]");
  process.exit(1);
}
const md = readFileSync(file, "utf8");
const MONTHS = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06", Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" };
const year = (/(\d{4})/.exec(file) || [])[1] || String(new Date().getFullYear());
// Normalise CRLF first: git checks this file out with Windows line endings,
// and a CR before "$" cut every post down to its first line (2026-11-23).
const posts = md
  .replace(/\r\n/g, "\n")
  .split(/\n---\s*\n/)
  .map((b) => /^## \w+ (\d{1,2}) (\w{3})[^\n]*\n([\s\S]*)$/m.exec(b))
  .filter(Boolean)
  .map((m) => ({
  date: `${year}-${MONTHS[m[2]]}-${m[1].padStart(2, "0")}`,
  text: m[3].trim(),
}));
if (!posts.length) throw new Error("no posts found");

const FOOTER = '\n\n🌐 <a href="https://mockonline.uz">mockonline.uz</a> · 📢 @ReadinMarathons';

/** Caption = the post + footer; the test link also goes on a button under the photo. */
function build(p) {
  const url = (/https:\/\/mockonline\.uz\/(?:reading|listening)\/[0-9a-f-]{36}/.exec(p.text) || [])[0];
  if (!url) throw new Error(`${p.date}: no test link in the post`);
  const caption = p.text + FOOTER;
  if (caption.length > 1024) throw new Error(`${p.date}: caption ${caption.length} > 1024`);
  const shot = new URL(`../docs/growth/shots/${p.date}.png`, import.meta.url);
  return { url, caption, shot };
}

async function api(token, method, body) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", body });
  const j = await res.json();
  if (!j.ok) throw new Error(`${method}: ${j.description}`);
  return j.result.message_id;
}

async function sendText(token, chatId, text) {
  const f = new FormData();
  f.set("chat_id", String(chatId));
  f.set("text", text);
  f.set("parse_mode", "HTML");
  return api(token, "sendMessage", f);
}

/** Photo (the test in the real exam screen) + caption + "Start the test" button. */
async function sendPost(token, chatId, p, prefix = "") {
  const { url, caption, shot } = build(p);
  const f = new FormData();
  f.set("chat_id", String(chatId));
  f.set("photo", new Blob([readFileSync(shot)], { type: "image/png" }), `${p.date}.png`);
  f.set("caption", prefix + caption);
  f.set("parse_mode", "HTML");
  f.set("reply_markup", JSON.stringify({ inline_keyboard: [[{ text: "▶️ Start the test", url }]] }));
  return api(token, "sendPhoto", f);
}

// Fail before sending anything if any post is broken (no link, too long, no picture).
for (const p of posts) {
  const { shot } = build(p);
  readFileSync(shot);
}

if (mode === "--preview") {
  const token = env("TELEGRAM_BOT_TOKEN");
  const owner = env("TELEGRAM_OWNER_ID");
  await sendText(token, owner, `👀 <b>Preview: ${posts.length} channel posts</b> (${posts[0].date} … ${posts.at(-1).date}).\nEach is a picture + text + a button. Nothing has been posted to the channel. Reply to Claude with approve / changes.`);
  for (const p of posts) {
    await sendPost(token, owner, p, `🗓 <i>${p.date}</i>\n\n`);
    await new Promise((r) => setTimeout(r, 600));
  }
  console.log(`previewed ${posts.length} posts to the owner`);
} else {
  // --send today  -> today's date in Tashkent (UTC+5), for the scheduled task.
  const day = arg === "today" ? new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10) : arg;
  const ci = process.argv.indexOf("--channel");
  const channel = ci > 0 ? process.argv[ci + 1] : "@ReadinMarathons";
  const p = posts.find((x) => x.date === day);
  if (!p) {
    console.log(`no post for ${day} in ${file}; nothing sent`);
    process.exit(0);
  }
  // Never post the same day to the same channel twice (a re-run, a retried task).
  const logUrl = new URL("../docs/growth/posted.log", import.meta.url);
  const already = existsSync(logUrl) && readFileSync(logUrl, "utf8").split(/\r?\n/).some((l) => {
    const [, d, ch] = l.split("\t");
    return d === day && ch === channel;
  });
  if (already) {
    console.log(`${day} was already posted to ${channel}; nothing sent`);
    process.exit(0);
  }
  const id = await sendPost(env("TELEGRAM_TEACHER_BOT_TOKEN"), channel, p);
  appendFileSync(logUrl, `${new Date().toISOString()}\t${day}\t${channel}\t${id}\n`);
  console.log(`posted ${day} to ${channel}: message ${id}`);
}
