// Register, inspect or remove the Telegram bot webhook.
//
//   node scripts/telegram-webhook.mjs info
//   node scripts/telegram-webhook.mjs set https://ielts-platform-dev.vercel.app
//   node scripts/telegram-webhook.mjs delete
//
// Credentials come from the env files via scripts/env.mjs, the same as every
// other script here, so the token is never typed into a shell (and never lands
// in shell history). `--env=local` picks .env.local; the default is live.
//
// A BOT HAS EXACTLY ONE WEBHOOK. Pointing this at production takes the dev
// preview offline, and vice versa. Use a second BotFather bot if you want both.

import { loadEnv } from "./env.mjs";

// The bot vars are not Supabase credentials, so the service-role check would
// fail for no reason here.
loadEnv({ requireServiceRole: false });

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

if (!token) {
  console.error("TELEGRAM_BOT_TOKEN is not set. Add it to the env file you targeted.");
  process.exit(1);
}

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const cmd = args[0] || "info";

async function api(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  return res.json();
}

/** Never print the token: it is embedded in file URLs and error text. */
const redact = (s) => String(s).split(token).join("<TOKEN>");

if (cmd === "info") {
  const info = await api("getWebhookInfo");
  const r = info.result ?? {};
  console.log(`url                  ${r.url || "(none)"}`);
  console.log(`custom certificate   ${r.has_custom_certificate ?? false}`);
  console.log(`pending updates      ${r.pending_update_count ?? 0}`);
  console.log(`max connections      ${r.max_connections ?? "-"}`);
  console.log(`allowed updates      ${(r.allowed_updates || []).join(", ") || "(all)"}`);
  // This is where a wrong secret, a Cloudflare challenge or a 404 shows up.
  // Check it FIRST when the bot goes quiet — it is almost always the answer.
  if (r.last_error_message) {
    console.log(`\nlast error           ${redact(r.last_error_message)}`);
    console.log(`  at                 ${new Date((r.last_error_date || 0) * 1000).toISOString()}`);
  } else {
    console.log("\nlast error           (none)");
  }
  process.exit(0);
}

if (cmd === "delete") {
  const out = await api("deleteWebhook", { drop_pending_updates: true });
  console.log(out.ok ? "Webhook removed." : `Failed: ${redact(out.description)}`);
  process.exit(out.ok ? 0 : 1);
}

if (cmd === "set") {
  const base = args[1];
  if (!base) {
    console.error("Usage: node scripts/telegram-webhook.mjs set <https://your-host>");
    process.exit(1);
  }
  if (!secret) {
    console.error("TELEGRAM_WEBHOOK_SECRET is not set. Generate one and add it first:");
    console.error("  node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"");
    process.exit(1);
  }
  if (!base.startsWith("https://")) {
    // Telegram refuses plain HTTP outright; catching it here gives a clearer
    // message than the API's.
    console.error("Telegram only delivers to https:// URLs.");
    process.exit(1);
  }

  const url = `${base.replace(/\/+$/, "")}/api/telegram`;
  const out = await api("setWebhook", {
    url,
    secret_token: secret,
    // Only what the bot handles. Without this, Telegram also sends edited
    // messages, polls, reactions and chat-member events that are parsed and
    // thrown away on every delivery.
    allowed_updates: ["message", "callback_query"],
    // Anything queued while the webhook was elsewhere is stale by definition.
    drop_pending_updates: true,
    max_connections: 10,
  });

  if (!out.ok) {
    console.error(`Failed: ${redact(out.description)}`);
    process.exit(1);
  }
  console.log(`Webhook set to ${url}`);
  console.log("Verify with: node scripts/telegram-webhook.mjs info");
  process.exit(0);
}

console.error(`Unknown command "${cmd}". Use: info | set <url> | delete`);
process.exit(1);
