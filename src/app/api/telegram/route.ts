import { NextResponse } from "next/server";

import { verifyWebhookSecret, isOwner } from "@/lib/telegram/auth";
import { sendMessage, editMessageText, answerCallbackQuery } from "@/lib/telegram/api";
import { parseCommand } from "@/lib/telegram/router";
import { decodeCb } from "@/lib/telegram/callback";
import { updateSender, updateChatId, type TelegramUpdate } from "@/lib/telegram/types";
import {
  buildOverview,
  buildStats,
  isPeriod,
  mainMenu,
  statsMenu,
} from "@/lib/telegram/commands/stats";

// nodejs: node:crypto (the timing-safe secret compare) and the service-role
// Supabase client both need it. maxDuration mirrors the cron routes — the live
// DigitalOcean host runs a long-lived server with no per-request ceiling, but
// the dev preview is Vercel, which has one.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * The bot's only entry point.
 *
 * Three things this handler must get right, in order of how badly they bite:
 *
 * 1. It must not throw. A 500 makes Telegram redeliver the same update, which
 *    for a write action means doing it twice. Every path below is wrapped.
 * 2. A stranger gets NOTHING — no reply, no button acknowledgement. A refusal
 *    message would confirm that an admin bot lives at this URL.
 * 3. A caller with the wrong webhook secret gets a bare 404, so the endpoint is
 *    indistinguishable from a path that does not exist.
 */
export async function POST(req: Request) {
  // Gate 1 — is this Telegram? 404, not 401: an authentication challenge is
  // itself a disclosure.
  if (!verifyWebhookSecret(req)) {
    return new NextResponse(null, { status: 404 });
  }

  let update: TelegramUpdate;
  try {
    update = (await req.json()) as TelegramUpdate;
  } catch {
    // Malformed body from something holding a valid secret. Nothing to do, and
    // nothing to gain from retrying it.
    return NextResponse.json({ ok: true });
  }

  // Gate 2 — is this the owner? Checked on the USER id, never the chat id.
  const from = updateSender(update);
  if (!isOwner(from?.id)) {
    // Visible in the deploy logs so an intrusion attempt is not invisible, but
    // silent to the sender.
    if (from) {
      console.warn(`[telegram] ignored update from non-owner ${from.id} (@${from.username ?? "?"})`);
    }
    return NextResponse.json({ ok: true });
  }

  try {
    await handle(update);
  } catch (e) {
    // Report into the chat rather than to Telegram: the owner is the only
    // person who can act on it, and a non-200 would only cause a retry.
    console.error("[telegram] handler failed", e);
    const chatId = updateChatId(update);
    if (chatId) {
      const msg = e instanceof Error ? e.message : "Unknown error.";
      await sendMessage(chatId, `⚠️ Something went wrong.\n<code>${msg}</code>`);
    }
  }

  return NextResponse.json({ ok: true });
}

async function handle(update: TelegramUpdate): Promise<void> {
  const chatId = updateChatId(update);
  if (chatId === null) return;

  // --- a tapped inline button ---
  const cq = update.callback_query;
  if (cq) {
    const cb = decodeCb(cq.data);
    // Always clear the button's spinner, even for a payload we don't
    // recognise, or the button spins until Telegram times it out.
    await answerCallbackQuery(cq.id);
    if (!cb || !cq.message) return;

    const { verb, args } = cb;
    if (verb === "menu") {
      await editMessageText(chatId, cq.message.message_id, await buildOverview(), mainMenu());
      return;
    }
    if (verb === "stats") {
      const period = isPeriod(args[0]) ? args[0] : "week";
      // Edited in place so tapping through Today/Week/Month leaves one card in
      // the chat instead of four.
      await editMessageText(chatId, cq.message.message_id, await buildStats(period), statsMenu(period));
      return;
    }
    if (verb === "students" || verb === "tests" || verb === "upload") {
      await sendMessage(chatId, "🚧 Not built yet — coming in the next phase.");
      return;
    }
    return;
  }

  // --- a typed message ---
  const message = update.message;
  if (!message) return;

  const command = parseCommand(message.text);
  if (!command) return;

  switch (command.name) {
    case "start":
    case "menu":
      await sendMessage(chatId, await buildOverview(), mainMenu());
      return;
    case "stats": {
      // Narrow through a const: `isPeriod(expr)` refines the expression, not a
      // fresh call to .trim(), so tsc rejects reusing it as a Period.
      const arg = command.args.trim().toLowerCase();
      const period = isPeriod(arg) ? arg : "week";
      await sendMessage(chatId, await buildStats(period), statsMenu(period));
      return;
    }
    case "help":
      await sendMessage(
        chatId,
        [
          "<b>Commands</b>",
          "/start — the admin menu",
          "/stats [today|week|month|all] — activity",
          "/help — this message",
        ].join("\n"),
      );
      return;
    default:
      await sendMessage(chatId, "Unknown command. Try /start.");
  }
}
