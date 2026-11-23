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
import { readFileSync, appendFileSync } from "node:fs";
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
const posts = [...md.matchAll(/^## \w+ (\d{1,2}) (\w{3})[^\n]*\n([\s\S]*?)(?=\n---|\s*$)/gm)].map((m) => ({
  date: `${year}-${MONTHS[m[2]]}-${m[1].padStart(2, "0")}`,
  text: m[3].trim(),
}));
if (!posts.length) throw new Error("no posts found");

async function send(token, chatId, text) {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
  const j = await res.json();
  if (!j.ok) throw new Error(j.description);
  return j.result.message_id;
}

if (mode === "--preview") {
  const token = env("TELEGRAM_BOT_TOKEN");
  const owner = env("TELEGRAM_OWNER_ID");
  await send(token, owner, `👀 <b>Preview: ${posts.length} channel posts</b> (${posts[0].date} … ${posts.at(-1).date}).\nNothing has been posted to the channel. Reply to Claude with approve / changes.`);
  for (const p of posts) {
    await send(token, owner, `🗓 <i>${p.date}</i>\n\n${p.text}`);
    await new Promise((r) => setTimeout(r, 400));
  }
  console.log(`previewed ${posts.length} posts to the owner`);
} else {
  const day = arg;
  const ci = process.argv.indexOf("--channel");
  const channel = ci > 0 ? process.argv[ci + 1] : "@ReadinMarathons";
  const p = posts.find((x) => x.date === day);
  if (!p) throw new Error(`no post for ${day}`);
  const id = await send(env("TELEGRAM_TEACHER_BOT_TOKEN"), channel, p.text);
  appendFileSync(new URL("../docs/growth/posted.log", import.meta.url), `${new Date().toISOString()}\t${day}\t${channel}\t${id}\n`);
  console.log(`posted ${day} to ${channel}: message ${id}`);
}
