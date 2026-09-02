import { NextResponse } from "next/server";

import { verifyWebhookSecret, isOwner } from "@/lib/telegram/auth";
import { sendMessage, editMessageText, answerCallbackQuery } from "@/lib/telegram/api";
import { parseCommand } from "@/lib/telegram/router";
import { decodeCb } from "@/lib/telegram/callback";
import { claimUpdate, getSession, setSession, clearSession } from "@/lib/telegram/state";
import {
  updateSender,
  updateChatId,
  type TelegramUpdate,
  type InlineKeyboard,
} from "@/lib/telegram/types";
import {
  buildOverview,
  buildStats,
  isPeriod,
  mainMenu,
  statsMenu,
} from "@/lib/telegram/commands/stats";
import {
  searchStudents,
  buildStudentCard,
  levelKeyboard,
  xpKeyboard,
  setPremium,
  giftXp,
  setLevel,
  setHidden,
} from "@/lib/telegram/commands/students";
import {
  listTests,
  buildTestCard,
  confirmDelete,
  deleteTest,
  renameTest,
} from "@/lib/telegram/commands/tests";
import {
  UPLOAD_PROMPT,
  receiveDocument,
  advance,
  publish,
} from "@/lib/telegram/commands/upload";

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
 *    for a write action means doing it twice. Every path below is wrapped, and
 *    claimUpdate() catches the redeliveries that slip through anyway.
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

  // Gate 3 — have we already done this? Telegram redelivers until it sees a
  // 200, and a redelivered write would apply twice.
  if (typeof update.update_id === "number" && !(await claimUpdate(update.update_id))) {
    return NextResponse.json({ ok: true, deduped: true });
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

  if (update.callback_query) return handleCallback(chatId, update);
  if (update.message) return handleMessage(chatId, update);
}

/** listTests returns an object; editMessageText takes positional arguments. */
async function listTestsArgs(
  skill: "reading" | "listening",
  page: number,
): Promise<[string, InlineKeyboard]> {
  const out = await listTests(skill, page);
  return [out.text, out.keyboard];
}

async function handleCallback(chatId: number, update: TelegramUpdate): Promise<void> {
  const cq = update.callback_query!;
  const cb = decodeCb(cq.data);

  // Always clear the button's spinner, even for a payload we do not recognise,
  // or it spins until Telegram times it out.
  await answerCallbackQuery(cq.id);
  if (!cb || !cq.message) return;

  const messageId = cq.message.message_id;
  const { verb, args } = cb;

  // Re-render the student card after a write, so the card is never stale.
  const refreshStudent = async (id: string, note: string) => {
    const card = await buildStudentCard(id);
    if (!card) {
      await editMessageText(chatId, messageId, "That account no longer exists.", mainMenu());
      return;
    }
    await editMessageText(chatId, messageId, `${card.text}\n\n<i>${note}</i>`, card.keyboard);
  };

  switch (verb) {
    case "menu":
      await clearSession(chatId);
      await editMessageText(chatId, messageId, await buildOverview(), mainMenu());
      return;

    case "stats": {
      const period = isPeriod(args[0]) ? args[0] : "week";
      // Edited in place so tapping through Today/Week/Month leaves one card in
      // the chat instead of four.
      await editMessageText(chatId, messageId, await buildStats(period), statsMenu(period));
      return;
    }

    case "students":
      // The next plain message is the search query.
      await setSession(chatId, "await_student_query");
      await editMessageText(
        chatId,
        messageId,
        "🔎 Send a name or email to search for.\n<i>/cancel to stop.</i>",
      );
      return;

    case "stu": {
      const card = await buildStudentCard(args[0] ?? "");
      if (!card) {
        await editMessageText(chatId, messageId, "That account no longer exists.", mainMenu());
        return;
      }
      await editMessageText(chatId, messageId, card.text, card.keyboard);
      return;
    }

    case "lvl":
      await editMessageText(chatId, messageId, "🎚 Move this student to which track?", levelKeyboard(args[0] ?? ""));
      return;

    case "xp":
      await editMessageText(chatId, messageId, "✨ How much XP?", xpKeyboard(args[0] ?? ""));
      return;

    case "prem": {
      const id = args[1] ?? "";
      const out = await setPremium(id, Number(args[0] ?? 0));
      await refreshStudent(id, out.ok ? `✅ ${out.note}` : `⚠️ ${out.note}`);
      return;
    }

    case "setxp": {
      const id = args[1] ?? "";
      const out = await giftXp(id, Number(args[0] ?? 0));
      await refreshStudent(id, out.ok ? `✅ ${out.note}` : `⚠️ ${out.note}`);
      return;
    }

    case "setlvl": {
      const id = args[1] ?? "";
      const out = await setLevel(id, args[0] ?? "regular");
      await refreshStudent(id, out.ok ? `✅ ${out.note}` : `⚠️ ${out.note}`);
      return;
    }

    case "hide": {
      const id = args[1] ?? "";
      const out = await setHidden(id, args[0] === "1");
      await refreshStudent(id, out.ok ? `✅ ${out.note}` : `⚠️ ${out.note}`);
      return;
    }

    case "tests":
      await editMessageText(chatId, messageId, ...(await listTestsArgs("reading", 0)));
      return;

    case "tp": {
      const skill = args[0] === "listening" ? "listening" : "reading";
      const page = Number(args[1] ?? 0) || 0;
      await editMessageText(chatId, messageId, ...(await listTestsArgs(skill, page)));
      return;
    }

    case "test": {
      const card = await buildTestCard(args[0] ?? "");
      if (!card) {
        await editMessageText(chatId, messageId, "That test no longer exists.", mainMenu());
        return;
      }
      await editMessageText(chatId, messageId, card.text, card.keyboard);
      return;
    }

    case "tren":
      await setSession(chatId, "await_rename", { testId: args[0] ?? "" }, messageId);
      await editMessageText(
        chatId,
        messageId,
        "✏️ Send the new title as a message.\n<i>/cancel to stop.</i>",
      );
      return;

    case "tdel": {
      const confirm = await confirmDelete(args[0] ?? "");
      if (!confirm) {
        await editMessageText(chatId, messageId, "That test no longer exists.", mainMenu());
        return;
      }
      await editMessageText(chatId, messageId, confirm.text, confirm.keyboard);
      return;
    }

    case "tdel2": {
      const out = await deleteTest(args[0] ?? "");
      await editMessageText(
        chatId,
        messageId,
        out.ok ? `🗑 ${out.note}` : `⚠️ ${out.note}`,
        mainMenu(),
      );
      return;
    }

    case "upload":
      await clearSession(chatId);
      await editMessageText(chatId, messageId, UPLOAD_PROMPT);
      return;

    case "up": {
      // A step of the upload wizard.
      const session = await getSession(chatId);
      const step = await advance(chatId, session, args[0] ?? "", args[1] ?? "");
      await editMessageText(chatId, messageId, step.text, step.keyboard);
      return;
    }

    default:
      return;
  }
}

async function handleMessage(chatId: number, update: TelegramUpdate): Promise<void> {
  const message = update.message!;
  const command = parseCommand(message.text);

  if (command) {
    switch (command.name) {
      case "start":
      case "menu":
        await clearSession(chatId);
        await sendMessage(chatId, await buildOverview(), mainMenu());
        return;

      case "cancel":
        await clearSession(chatId);
        await sendMessage(chatId, "Cancelled.", mainMenu());
        return;

      case "stats": {
        // Narrow through a const: `isPeriod(expr)` refines the expression, not
        // a fresh call to .trim(), so tsc rejects reusing it as a Period.
        const arg = command.args.trim().toLowerCase();
        const period = isPeriod(arg) ? arg : "week";
        await sendMessage(chatId, await buildStats(period), statsMenu(period));
        return;
      }

      case "students": {
        if (command.args.trim()) {
          const found = await searchStudents(command.args);
          await sendMessage(chatId, found.text, found.keyboard);
          return;
        }
        await setSession(chatId, "await_student_query");
        await sendMessage(chatId, "🔎 Send a name or email to search for.\n<i>/cancel to stop.</i>");
        return;
      }

      case "tests": {
        const out = await listTests("reading", 0);
        await sendMessage(chatId, out.text, out.keyboard);
        return;
      }

      case "upload":
        await clearSession(chatId);
        await sendMessage(chatId, UPLOAD_PROMPT);
        return;

      case "help":
        await sendMessage(
          chatId,
          [
            "<b>Commands</b>",
            "/start — the admin menu",
            "/stats [today|week|month|all] — activity",
            "/students &lt;name or email&gt; — find a student",
            "/tests — browse, rename or delete tests",
            "/upload — publish a new CDI test",
            "/cancel — abandon whatever is in progress",
            "/help — this message",
          ].join("\n"),
        );
        return;

      default:
        await sendMessage(chatId, "Unknown command. Try /start.");
        return;
    }
  }

  // A document is always an upload attempt, whatever step we were on.
  if (message.document) {
    // Acknowledge immediately: downloading and parsing a paper takes a moment,
    // and a silent bot looks broken. The placeholder is then edited with the
    // outcome rather than replaced, so the chat stays tidy.
    const ack = await sendMessage(chatId, "⏳ Downloading and reading the answer key…");
    const out = await receiveDocument(chatId, message.document);
    if (ack.ok) {
      await editMessageText(chatId, ack.value.message_id, out.text, out.keyboard);
    } else {
      await sendMessage(chatId, out.text, out.keyboard);
    }
    return;
  }

  // Not a command and not a file: it may be an answer a wizard is waiting for.
  const session = await getSession(chatId);
  if (!session || !message.text) return;

  switch (session.step) {
    case "await_student_query": {
      await clearSession(chatId);
      const found = await searchStudents(message.text);
      await sendMessage(chatId, found.text, found.keyboard);
      return;
    }

    case "await_rename": {
      const testId = String(session.data.testId ?? "");
      await clearSession(chatId);
      const out = await renameTest(testId, message.text);
      if (!out.ok) {
        await sendMessage(chatId, `⚠️ ${out.note}`);
        return;
      }
      const card = await buildTestCard(testId);
      if (card) {
        await sendMessage(chatId, `${card.text}\n\n<i>✅ ${out.note}</i>`, card.keyboard);
      } else {
        await sendMessage(chatId, `✅ ${out.note}`, mainMenu());
      }
      return;
    }

    case "await_title": {
      const out = await publish(chatId, session, message.text);
      await sendMessage(chatId, out.text, out.keyboard);
      return;
    }

    default:
      return;
  }
}
