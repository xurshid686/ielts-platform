// Encoding for inline-button `callback_data`.
//
// Telegram caps callback_data at 64 BYTES. That is enough for a verb plus a
// uuid (36 chars) — `stu:<uuid>` is 40 bytes, `prem:3:<uuid>` is 43 — but not
// for a title or a file, which is why the upload wizard keeps its state in the
// database instead (see state.ts).
//
// Pure module: unit-tested, imports nothing.

/** Telegram's hard limit on callback_data. */
export const MAX_CALLBACK_BYTES = 64;

export type Callback = { verb: string; args: string[] };

/**
 * Build a callback_data string.
 *
 * Throws when the result would exceed 64 bytes. Telegram answers an over-long
 * payload with a 400 at send time, which surfaces as a button that silently
 * does nothing — far harder to diagnose than a failure here. Callers pass
 * fixed verbs and uuids, so a throw means a programming error, not bad input.
 */
export function encodeCb(verb: string, ...args: string[]): string {
  const data = [verb, ...args].join(":");
  const bytes = Buffer.byteLength(data, "utf8");
  if (bytes > MAX_CALLBACK_BYTES) {
    throw new Error(`callback_data is ${bytes} bytes, over Telegram's ${MAX_CALLBACK_BYTES}: ${data}`);
  }
  return data;
}

/**
 * Parse callback_data back into a verb and its arguments.
 *
 * Returns null rather than throwing: this string comes off the wire, and a
 * malformed one must not be able to 500 the webhook.
 */
export function decodeCb(data: string | null | undefined): Callback | null {
  if (typeof data !== "string" || data.length === 0) return null;
  const parts = data.split(":");
  const verb = parts[0];
  if (!verb) return null;
  return { verb, args: parts.slice(1) };
}
