import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendMessage } from "./api";
import { escapeHtml, band, num } from "./format";

// One-way pushes to the owner.
//
// Contract, borrowed from src/lib/email/send.ts: this NEVER throws and never
// blocks the thing that triggered it. A Telegram outage must not be able to
// fail a student's submission — saveResult() is the scored-write path, and its
// job is to save the score, not to tell anyone about it.

function ownerChatId(): number | null {
  const raw = process.env.TELEGRAM_OWNER_ID;
  if (!raw) return null;
  const id = Number(raw.trim());
  return Number.isFinite(id) ? id : null;
}

/** True when a push could actually be delivered. Cheap; no network. */
export function notificationsConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN) && ownerChatId() !== null;
}

async function push(text: string): Promise<void> {
  const chatId = ownerChatId();
  if (!chatId || !process.env.TELEGRAM_BOT_TOKEN) return; // silently disabled
  const res = await sendMessage(chatId, text);
  if (!res.ok) console.error(`[telegram] notify failed: ${res.error}`);
}

/**
 * A student finished a test.
 *
 * Called from saveResult() inside `after()`, so it runs once the student
 * already has their result. Every lookup here is best-effort: if the name or
 * the test title cannot be read, the message degrades rather than disappearing.
 */
export async function notifyNewAttempt(input: {
  userId: string;
  testId: string;
  skill: string;
  raw: number;
  total: number;
  band: number;
}): Promise<void> {
  if (!notificationsConfigured()) return;

  try {
    const db = createAdminClient();
    const [{ data: prof }, { data: test }] = await Promise.all([
      db.from("profiles").select("name, email").eq("id", input.userId).maybeSingle(),
      db.from("tests").select("title").eq("id", input.testId).maybeSingle(),
    ]);

    const who = (prof as { name?: string | null; email?: string | null } | null) ?? {};
    const name = who.name || who.email || "A student";
    const title = (test as { title?: string } | null)?.title ?? "a test";

    await push(
      [
        `✅ <b>${escapeHtml(name)}</b> finished a test`,
        escapeHtml(title),
        `${input.skill} · ${num(input.raw)}/${num(input.total)} · band <b>${band(input.band)}</b>`,
      ].join("\n"),
    );
  } catch (e) {
    // Never rethrow: this runs after the response, where an exception would be
    // an unhandled rejection rather than something a user could act on.
    console.error("[telegram] notifyNewAttempt failed", e);
  }
}

/**
 * A new account was created.
 *
 * Not called from application code: `profiles` rows are written by the
 * `handle_new_user()` trigger on `auth.users`, and registration goes straight
 * through the Supabase client, so there is no server action to hook. The
 * database calls /api/telegram/event instead — see migration 0043.
 */
export async function notifyNewStudent(input: {
  id: string;
  name: string | null;
  email: string | null;
}): Promise<void> {
  if (!notificationsConfigured()) return;

  try {
    const db = createAdminClient();
    const { count } = await db.from("profiles").select("id", { count: "exact", head: true });

    await push(
      [
        `👋 <b>New student</b>`,
        escapeHtml(input.name || "(no name yet)"),
        escapeHtml(input.email || "(no email)"),
        "",
        `${num(count ?? 0)} accounts in total.`,
      ].join("\n"),
    );
  } catch (e) {
    console.error("[telegram] notifyNewStudent failed", e);
  }
}
