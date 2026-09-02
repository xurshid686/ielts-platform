// Command parsing. Pure, so it is unit-tested; the dispatch that uses it lives
// in the webhook route where it can reach Supabase.

export type ParsedCommand = { name: string; args: string };

/**
 * Parse a `/command` out of a message.
 *
 * Telegram appends the bot's username in group chats (`/stats@MyBot`), and
 * clients sometimes leave trailing whitespace. Both are stripped so the
 * dispatch table only ever sees a bare lowercase verb. Returns null for
 * ordinary text — which is not an error: free text is how the wizard collects
 * a title.
 */
export function parseCommand(text: string | null | undefined): ParsedCommand | null {
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) return null;

  const space = trimmed.search(/\s/);
  const head = space === -1 ? trimmed : trimmed.slice(0, space);
  const args = space === -1 ? "" : trimmed.slice(space + 1).trim();

  // `/stats@MockOnlineBot` -> `stats`
  const name = head.slice(1).split("@")[0]!.toLowerCase();
  if (!name) return null;

  return { name, args };
}
