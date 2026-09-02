// The three gates that make this bot single-user. All of them must pass before
// any update is dispatched, and each one fails CLOSED.
//
// These functions are deliberately free of `server-only` and of any Supabase
// import so they can be unit-tested directly (see auth.test.ts).

import { timingSafeEqual } from "node:crypto";

/** Telegram sends the registered secret back on every webhook request. */
export const SECRET_HEADER = "x-telegram-bot-api-secret-token";

/**
 * Compare two secrets without leaking their contents through timing.
 *
 * `timingSafeEqual` throws when the buffers differ in length, which would
 * itself leak the length — so the lengths are checked first and a mismatch
 * short-circuits. That is not a weakness: the length of a fixed-size secret is
 * not the part worth hiding, and an attacker who can already vary the length
 * learns nothing they could not learn by counting bytes they sent.
 */
export function secretsMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Gate 1 — did this request come from Telegram?
 *
 * Anyone can POST to a public URL. The secret token proves the caller is the
 * Telegram server we registered the webhook with, and nothing else.
 */
export function verifyWebhookSecret(req: Request): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  // Unset config means the bot is not deployed here. Refuse everything rather
  // than accepting everything — same shape as the cron routes' `authorized()`
  // returning false when CRON_SECRET is missing.
  if (!expected) return false;

  const got = req.headers.get(SECRET_HEADER);
  if (!got) return false;

  return secretsMatch(got, expected);
}

/**
 * Gate 2 — is this the one person allowed to use the bot?
 *
 * A stranger who somehow gets past gate 1 still cannot do anything. They are
 * answered with silence rather than a refusal: "you are not authorised" is a
 * confirmation that something worth attacking lives here.
 */
export function isOwner(userId: number | null | undefined): boolean {
  const owner = process.env.TELEGRAM_OWNER_ID;
  if (!owner) return false;
  if (typeof userId !== "number" || !Number.isFinite(userId)) return false;

  // Telegram user ids are integers well inside Number.MAX_SAFE_INTEGER, so a
  // numeric comparison is exact. Parsing the env var rather than stringifying
  // the id means " 123 " and "123" agree, and "abc" is NaN and never matches.
  const expected = Number(owner.trim());
  if (!Number.isFinite(expected)) return false;

  return userId === expected;
}

/** Gate 3 — is there a bot at all? Used to skip work when unconfigured. */
export function botConfigured(): boolean {
  return Boolean(
    process.env.TELEGRAM_BOT_TOKEN &&
      process.env.TELEGRAM_OWNER_ID &&
      process.env.TELEGRAM_WEBHOOK_SECRET,
  );
}
