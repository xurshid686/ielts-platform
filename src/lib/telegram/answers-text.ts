// Pure formatting of a test's answer key for the teacher bot. No imports, so it is unit-testable.
//
// The key is stored as { "<question number>": ["accepted answer", ...] } with lowercase values.
// It is sent as a Telegram SPOILER (blurred until tapped), separate from the PDF: the paper itself
// never carries answers (owner rule), and a spoiler lets a teacher reveal them on demand.

const WORDS = new Set(["true", "false", "not given", "yes", "no"]);

function show(a: string): string {
  const t = a.trim();
  if (WORDS.has(t.toLowerCase())) return t.toUpperCase();
  if (/^[a-k]$/i.test(t)) return t.toUpperCase();   // option letters
  return t;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** One "N  answer" line per question, numeric order; accepted variants joined with " / ". */
export function answerLines(key: Record<string, unknown> | null | undefined): string[] {
  if (!key) return [];
  return Object.keys(key)
    .map((k) => ({ k, n: Number(k.replace(/^q/i, "")) }))
    .filter((x) => Number.isFinite(x.n))
    .sort((a, b) => a.n - b.n)
    .map(({ k, n }) => {
      const raw = key[k];
      const list = (Array.isArray(raw) ? raw : [raw]).filter((v) => typeof v === "string" && v.trim()) as string[];
      return `${n}   ${list.map(show).join(" / ")}`;
    });
}

/** The Telegram HTML message: a bold title, then every answer inside ONE spoiler. */
export function answerMessage(title: string, key: Record<string, unknown> | null | undefined): string | null {
  const lines = answerLines(key);
  if (!lines.length) return null;
  return `<b>Answers · ${esc(title)}</b>\n<tg-spoiler>${esc(lines.join("\n"))}</tg-spoiler>`;
}
