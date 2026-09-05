// String shaping for the Discipline progress report (the Word export).
//
// IMPORTS NOTHING, on purpose — the same rule discipline-shared.ts follows and
// for the same reason: there is no vitest config and therefore no `@/` alias,
// so a unit-tested module must import relatively and pull in neither
// `server-only` nor a Supabase client. Keeping the wording here also means the
// document's text can be tested without building a document.

/** The Progress tab's filter state, as the report needs to describe it. */
export type ReportFilters = {
  query: string;
  onlyInactive: boolean;
  onlyTrailing: boolean;
  onlyStrikes: boolean;
  /** The day the filter is keyed to ("not finished Day N"), or null for any. */
  dayNumber: number | null;
};

/** What one test's cell says: its first-attempt score, or a dot for not done. */
export function testScoreText(t: { raw: number | null; total: number | null }): string {
  if (t.raw === null) return "·";
  return `${t.raw}/${t.total ?? "?"}`;
}

/**
 * One line per test attached to that day, matching the on-screen cell.
 * A day with no tests reads "—" rather than being blank, so an empty column is
 * obviously empty rather than looking like missing data.
 */
export function cellLines(tests: { raw: number | null; total: number | null }[]): string[] {
  if (tests.length === 0) return ["—"];
  return tests.map(testScoreText);
}

/** A student with no name saved still needs something in the Student column. */
export function studentLabel(name: string | null): string {
  return name?.trim() || "Student";
}

/**
 * The screen shows Inactive / Trailing as coloured pills. A Word table has no
 * pills, so they become a suffix on the name.
 */
export function flagSuffix(row: { inactive: boolean; trailing: boolean }): string {
  const flags: string[] = [];
  if (row.inactive) flags.push("Inactive");
  if (row.trailing) flags.push("Trailing");
  return flags.length === 0 ? "" : ` (${flags.join(", ")})`;
}

/**
 * ISO date, NOT `toLocaleDateString()`.
 *
 * The screen can use the viewer's locale because the viewer is reading it live.
 * This document is generated on the SERVER and then forwarded to other people:
 * a server-locale "9/5/2026" is read as 5 September by half the world and 9 May
 * by the other half. `2026-09-05` cannot be misread.
 */
export function dateText(iso: string | null): string {
  if (!iso) return "never";
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "never";
  return t.toISOString().slice(0, 10);
}

/** Says which filters produced this document, so a shared file is self-explaining. */
export function filterSummary(f: ReportFilters): string {
  const parts: string[] = [];
  if (f.onlyInactive) parts.push("inactive only");
  if (f.onlyTrailing) parts.push("trailing only");
  if (f.onlyStrikes) parts.push("with strikes");
  if (f.dayNumber !== null) parts.push(`not finished Day ${f.dayNumber}`);
  const q = f.query.trim();
  if (q) parts.push(`matching “${q}”`);
  return parts.length === 0 ? "All students." : `Filtered: ${parts.join(" · ")}.`;
}

/** `discipline-progress-2026-09-05.docx` */
export function reportFilename(now: Date): string {
  return `discipline-progress-${now.toISOString().slice(0, 10)}.docx`;
}
