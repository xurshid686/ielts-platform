import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

// Wizard state and update de-duplication, both backed by migration 0042.
//
// State has to live in the database because the app is serverless on the dev
// preview: module scope does not survive between requests. It cannot live in
// `callback_data` either — that is capped at 64 bytes, and the steps that
// matter (a typed title, an uploaded document) arrive on messages that carry no
// callback payload at all.

/** A wizard left half-finished should not trap the next /start. */
const SESSION_TTL_MS = 30 * 60 * 1000;

/** How long a handled update_id is remembered for the dedupe check. */
const UPDATE_TTL_HOURS = 24;

export type Session = {
  step: string;
  data: Record<string, unknown>;
  messageId: number | null;
};

/**
 * Has this update already been handled?
 *
 * Telegram redelivers an update until it gets a 200, and a redelivered upload
 * would publish the same test twice. A retry carries the identical `update_id`,
 * so a unique-violation on insert is an exact answer rather than a guess.
 *
 * Returns true when the update is NEW and should be processed.
 */
export async function claimUpdate(updateId: number): Promise<boolean> {
  const db = createAdminClient();
  const { error } = await db.from("telegram_updates").insert({ update_id: updateId });

  if (error) {
    // 23505 = unique violation = we have seen this one.
    if (error.code === "23505") return false;
    // Any other failure (the table missing, a network blip) must not silently
    // drop the owner's command. Log it and let the update through: processing
    // twice is recoverable, refusing to work at all is not.
    console.error(`[telegram] dedupe insert failed, processing anyway: ${error.message}`);
    return true;
  }

  // Opportunistic cleanup. Deliberately not a cron job: Vercel cron does not
  // run on the live DigitalOcean host, so a scheduled cleaner would never fire.
  // One in ~20 updates pays for it, which at this volume is a few rows a week.
  if (Math.random() < 0.05) {
    const cutoff = new Date(Date.now() - UPDATE_TTL_HOURS * 3600_000).toISOString();
    const { error: pruneErr } = await db
      .from("telegram_updates")
      .delete()
      .lt("received_at", cutoff);
    if (pruneErr) console.error(`[telegram] prune failed: ${pruneErr.message}`);
  }

  return true;
}

export async function getSession(chatId: number): Promise<Session | null> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("telegram_sessions")
    .select("step, data, message_id, updated_at")
    .eq("chat_id", chatId)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as {
    step: string;
    data: unknown;
    message_id: number | null;
    updated_at: string;
  };

  // Expire on read rather than on a timer, for the same reason as above.
  if (Date.now() - new Date(row.updated_at).getTime() > SESSION_TTL_MS) {
    await clearSession(chatId);
    return null;
  }

  return {
    step: row.step,
    data: (row.data && typeof row.data === "object" ? row.data : {}) as Record<string, unknown>,
    messageId: row.message_id,
  };
}

export async function setSession(
  chatId: number,
  step: string,
  data: Record<string, unknown> = {},
  messageId: number | null = null,
): Promise<void> {
  const db = createAdminClient();
  const { error } = await db.from("telegram_sessions").upsert(
    {
      chat_id: chatId,
      step,
      // Cast at the boundary: the column is jsonb, so the generated type is
      // `Json` and an arbitrary record cannot be proven to fit it.
      data: data as never,
      message_id: messageId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "chat_id" },
  );
  if (error) console.error(`[telegram] setSession failed: ${error.message}`);
}

export async function clearSession(chatId: number): Promise<void> {
  const db = createAdminClient();
  const { error } = await db.from("telegram_sessions").delete().eq("chat_id", chatId);
  if (error) console.error(`[telegram] clearSession failed: ${error.message}`);
}
