// Pure parsing for the teacher bot's /start deep links. No imports, so it is unit-testable.
//
// The site button links to  https://t.me/<bot>?start=<payload>  and Telegram delivers
// "/start <payload>". Payloads may only contain [A-Za-z0-9_-] and are capped at 64 characters.
//
//   pdf_<testUuid>             — send this test's PDF (the chat is already linked)
//   pdf_<testUuid>_<code>      — link this chat to the account that minted <code>, then send
//   (nothing)                  — a plain /start

export type StartAction =
  | { kind: "pdf"; testId: string; code: string | null }
  | { kind: "none" };

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PDF_RE = new RegExp(`^pdf_(${UUID})(?:_([A-Za-z0-9]{12}))?$`, "i");

export function parseStart(text: string | undefined | null): StartAction {
  if (!text) return { kind: "none" };
  const m = /^\/start(?:@\w+)?(?:\s+(\S+))?\s*$/.exec(text.trim());
  if (!m || !m[1]) return { kind: "none" };
  const p = PDF_RE.exec(m[1]);
  if (!p) return { kind: "none" };
  return { kind: "pdf", testId: p[1].toLowerCase(), code: p[2] ?? null };
}

/** Build the payload the site puts in the t.me link. Throws if it would exceed Telegram's cap. */
export function buildPdfPayload(testId: string, code?: string | null): string {
  const payload = code ? `pdf_${testId}_${code}` : `pdf_${testId}`;
  if (payload.length > 64) throw new Error("start payload longer than 64 characters");
  return payload;
}
