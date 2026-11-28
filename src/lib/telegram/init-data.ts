// Verifies a Telegram Mini App's `initData`: the signed string Telegram hands the
// page that tells us WHICH Telegram user opened it. It is the only thing the
// /tg sign-in trusts, so this check is the security boundary of that feature.
//
// Telegram's documented algorithm (core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app):
//   data_check_string = every field except `hash`, as "key=value", sorted by key, joined by "\n"
//   secret_key        = HMAC_SHA256(key = "WebAppData", message = <bot token>)
//   valid             = hex(HMAC_SHA256(key = secret_key, message = data_check_string)) == hash
//
// Pure apart from node:crypto, so it is unit-tested without the @/ alias.

import { createHmac, timingSafeEqual } from "node:crypto";

/** How old an initData may be. Telegram mints a fresh one every time the Mini App opens. */
export const INIT_DATA_MAX_AGE_S = 5 * 60;
/** Clock skew tolerated for an auth_date slightly in the future. */
const FUTURE_SKEW_S = 60;

export type InitDataUser = { tgUserId: number; firstName: string | null; languageCode: string | null };

export type InitDataResult =
  | { ok: true; user: InitDataUser; authDate: number }
  | { ok: false; reason: "malformed" | "bad_hash" | "stale" | "no_user" };

function hmac(key: string | Buffer, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

/** The string Telegram signs. Exported for tests and for scripts that mint test initData. */
export function dataCheckString(params: URLSearchParams): string {
  const pairs: string[] = [];
  for (const [k, v] of params) if (k !== "hash") pairs.push(`${k}=${v}`);
  return pairs.sort().join("\n");
}

export function signInitData(fields: Record<string, string>, botToken: string): string {
  const params = new URLSearchParams(fields);
  const secret = hmac("WebAppData", botToken);
  params.set("hash", hmac(secret, dataCheckString(params)).toString("hex"));
  return params.toString();
}

export function verifyInitData(
  initData: string,
  botToken: string,
  nowS: number = Math.floor(Date.now() / 1000),
): InitDataResult {
  if (typeof initData !== "string" || initData.length === 0 || initData.length > 4096 || !botToken) {
    return { ok: false, reason: "malformed" };
  }
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return { ok: false, reason: "malformed" };
  }
  const hash = params.get("hash");
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) return { ok: false, reason: "malformed" };
  // A repeated key would make "the" value ambiguous between Telegram's view and ours.
  const keys = [...params.keys()];
  if (new Set(keys).size !== keys.length) return { ok: false, reason: "malformed" };

  const expected = hmac(hmac("WebAppData", botToken), dataCheckString(params));
  const got = Buffer.from(hash, "hex");
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return { ok: false, reason: "bad_hash" };

  // Only AFTER the signature holds is any field worth reading.
  const authDate = Number(params.get("auth_date"));
  if (!Number.isInteger(authDate) || authDate <= 0) return { ok: false, reason: "malformed" };
  if (nowS - authDate > INIT_DATA_MAX_AGE_S || authDate - nowS > FUTURE_SKEW_S) return { ok: false, reason: "stale" };

  let raw: unknown;
  try {
    raw = JSON.parse(params.get("user") ?? "null");
  } catch {
    return { ok: false, reason: "malformed" };
  }
  const u = raw as { id?: unknown; first_name?: unknown; language_code?: unknown; is_bot?: unknown } | null;
  if (!u || typeof u.id !== "number" || !Number.isSafeInteger(u.id) || u.id <= 0 || u.is_bot === true) {
    return { ok: false, reason: "no_user" };
  }
  return {
    ok: true,
    authDate,
    user: {
      tgUserId: u.id,
      firstName: typeof u.first_name === "string" ? u.first_name : null,
      languageCode: typeof u.language_code === "string" ? u.language_code : null,
    },
  };
}
