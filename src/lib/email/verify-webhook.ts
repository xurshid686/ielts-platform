// Resend delivery webhooks (0056). Resend signs them with Svix, so a request is
// only trusted when the HMAC over "<id>.<timestamp>.<raw body>" matches the
// endpoint's signing secret.
//
// IMPORTS ONLY node:crypto so it can be unit tested (the discipline-report-text
// rule). Everything here is pure: the route reads the headers and the RAW body
// — parsing first and re-serialising would change the bytes and fail the check.

import { createHmac, timingSafeEqual } from "node:crypto";

/** Five minutes each way, as Svix recommends: enough for clock drift, not for a replay. */
export const WEBHOOK_TOLERANCE_S = 5 * 60;

export type VerifyInput = {
  /** The signing secret, "whsec_<base64>" (the prefix is optional). */
  secret: string;
  /** `svix-id`, `svix-timestamp`, `svix-signature` from the request. */
  id: string | null;
  timestamp: string | null;
  signature: string | null;
  /** The body exactly as received. */
  body: string;
  /** Epoch seconds; injected so the test does not depend on the clock. */
  nowS: number;
};

export type VerifyResult = { ok: true } | { ok: false; reason: string };

/** The status a Resend event moves a message to, or null for events we ignore. */
export function statusForEvent(type: unknown): string | null {
  switch (type) {
    case "email.sent":
      return "sent";
    case "email.delivered":
      return "delivered";
    case "email.delivery_delayed":
      return "delayed";
    case "email.bounced":
      return "bounced";
    case "email.complained":
      return "complained";
    case "email.failed":
      return "failed";
    default:
      // opened / clicked / anything new: recorded nowhere, answered 200.
      return null;
  }
}

/**
 * How far along a message is. A late event must not drag it backwards (Resend
 * can deliver "sent" after "delivered"), and a terminal state always wins —
 * a bounce is the fact that matters, whatever arrives afterwards.
 */
const RANK: Record<string, number> = { queued: 0, sent: 1, delayed: 2, delivered: 3 };
const TERMINAL = new Set(["bounced", "complained", "failed"]);

export function shouldAdvance(current: string, next: string): boolean {
  if (current === next) return false;
  if (TERMINAL.has(current)) return false;
  if (TERMINAL.has(next)) return true;
  return (RANK[next] ?? -1) > (RANK[current] ?? -1);
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Verifies a Svix-signed webhook. Never throws — a bad request is a reason, not an exception. */
export function verifyWebhook(input: VerifyInput): VerifyResult {
  const { secret, id, timestamp, signature, body, nowS } = input;
  if (!secret) return { ok: false, reason: "no signing secret configured" };
  if (!id || !timestamp || !signature) return { ok: false, reason: "missing svix headers" };

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: "bad timestamp" };
  if (Math.abs(nowS - ts) > WEBHOOK_TOLERANCE_S) return { ok: false, reason: "timestamp outside tolerance" };

  let key: Buffer;
  try {
    key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  } catch {
    return { ok: false, reason: "bad signing secret" };
  }
  if (!key.length) return { ok: false, reason: "bad signing secret" };

  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");

  // The header carries a space-separated list, each "<version>,<signature>";
  // more than one appears while a secret is being rotated.
  const offered = signature
    .split(" ")
    .map((part) => part.trim())
    .filter((part) => part.startsWith("v1,"))
    .map((part) => part.slice(3));
  if (!offered.length) return { ok: false, reason: "no v1 signature" };
  return offered.some((sig) => safeEqual(sig, expected)) ? { ok: true } : { ok: false, reason: "signature mismatch" };
}

/** The signature a sender would produce — used by the end-to-end test, and by the unit test. */
export function signWebhook(secret: string, id: string, timestamp: string, body: string): string {
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  return `v1,${createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64")}`;
}
