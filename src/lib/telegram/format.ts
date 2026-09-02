// Pure message builders. No Supabase, no `server-only`, no fetch — so vitest
// can import this file directly. (There is no vitest config in this project and
// therefore no `@/` alias: tests import their subject relatively, and anything
// they touch must not drag in `server-only`.)

/** Telegram rejects a sendMessage body over 4096 characters. */
export const MAX_MESSAGE = 4096;

/** Escape the characters Telegram's HTML parse_mode cares about. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Cut a message down to Telegram's limit.
 *
 * Truncating mid-tag would produce invalid HTML and Telegram would reject the
 * whole message, so the cut is made at the last newline that still fits — our
 * messages are line-oriented and never wrap a tag across lines.
 */
export function clamp(text: string, limit = MAX_MESSAGE): string {
  if (text.length <= limit) return text;
  const head = text.slice(0, limit - 2);
  const lastLine = head.lastIndexOf("\n");
  return `${lastLine > limit / 2 ? head.slice(0, lastLine) : head}\n…`;
}

/** Thousands separators, so "1 240 XP" is readable at a glance on a phone. */
export function num(n: number): string {
  return n.toLocaleString("en-US").replace(/,/g, "\u202f");
}

/** A band to one decimal, or an em dash when there is nothing to show. */
export function band(b: number | null | undefined): string {
  return typeof b === "number" && Number.isFinite(b) ? b.toFixed(1) : "—";
}

/** "4 Mar 2026" — short, unambiguous, and not locale-dependent on the server. */
export function date(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** A signed delta, for period-over-period comparisons. "—" when there is no prior. */
export function delta(now: number, prev: number | null): string {
  if (prev === null) return "";
  const d = now - prev;
  if (d === 0) return " (=)";
  return d > 0 ? ` (▲ ${num(d)})` : ` (▼ ${num(-d)})`;
}

export type StatsView = {
  label: string;
  students: number;
  newStudents: number;
  tests: number;
  attempts: number;
  prevAttempts: number | null;
  reading: number;
  listening: number;
  avgBand: number | null;
  bestBand: number | null;
  activeStreaks: number;
  premium: number;
  top: { name: string; attempts: number; avg: number | null }[];
};

export function fmtStats(v: StatsView): string {
  const lines = [
    `📊 <b>${escapeHtml(v.label)}</b>`,
    "",
    `Attempts     <b>${num(v.attempts)}</b>${delta(v.attempts, v.prevAttempts)}`,
    `  reading ${num(v.reading)} · listening ${num(v.listening)}`,
    `New students <b>${num(v.newStudents)}</b>`,
    `Avg band     <b>${band(v.avgBand)}</b>${v.bestBand !== null ? ` (best ${band(v.bestBand)})` : ""}`,
    "",
    `Totals: ${num(v.students)} students · ${num(v.tests)} tests`,
    `🔥 ${num(v.activeStreaks)} active streaks · 👑 ${num(v.premium)} premium`,
  ];

  if (v.top.length > 0) {
    lines.push("", "<b>Most active</b>");
    v.top.forEach((t, i) => {
      const avg = t.avg === null ? "" : ` · ${band(t.avg)} avg`;
      lines.push(`${i + 1}. ${escapeHtml(t.name)} — ${num(t.attempts)} attempts${avg}`);
    });
  }

  return clamp(lines.join("\n"));
}

export type OverviewCounts = {
  students: number;
  tests: number;
  results: number;
  activeStreaks: number;
  premium: number;
  attemptsToday: number;
  newStudentsToday: number;
};

export function fmtOverview(c: OverviewCounts): string {
  return clamp(
    [
      "🎓 <b>MockOnline admin</b>",
      "",
      `👥 ${num(c.students)} students · 🧪 ${num(c.tests)} tests · ✅ ${num(c.results)} results`,
      `🔥 ${num(c.activeStreaks)} active streaks · 👑 ${num(c.premium)} premium`,
      "",
      `<b>Today</b>: ${num(c.attemptsToday)} attempts · ${num(c.newStudentsToday)} new students`,
    ].join("\n"),
  );
}
