// Pure helpers for the student dashboard (Today + Progress). Imports nothing, so
// they are unit-tested without the @/ alias, like discipline-shared.ts.

export type SkillKey = "reading" | "listening" | "writing";

export type ResultForDash = {
  skill: string;
  band: number | string | null;
  submitted_at: string;
};

/** YYYY-MM-DD of an instant in a time zone (falls back to UTC on a bad zone). */
export function dayIn(iso: string | number | Date, tz: string | null | undefined): string {
  const d = new Date(iso);
  try {
    return d.toLocaleDateString("en-CA", { timeZone: tz || "UTC" });
  } catch {
    return d.toLocaleDateString("en-CA", { timeZone: "UTC" });
  }
}

/** The student's results from today (their time zone), newest first as given. */
export function todaysResults<T extends ResultForDash>(results: T[], tz: string | null | undefined, now: number = Date.now()): T[] {
  const today = dayIn(now, tz);
  return results.filter((r) => dayIn(r.submitted_at, tz) === today);
}

/** IELTS rounding to the nearest half band (6.25 -> 6.5, 6.75 -> 7.0). */
export function roundHalf(n: number): number {
  return Math.round(n * 2) / 2;
}

const RECENT = 5;

export type SkillSnapshot = {
  key: SkillKey;
  /** Average of the most recent results (up to 5), rounded to a half band; null with none. */
  band: number | null;
  count: number;
};

/**
 * Reading and Listening from the last 5 results each; Writing from the latest AI writing
 * check (practice essays live in writing_ai_checks, not results), falling back to results.
 * Speaking is deliberately absent (not sold; owner 2026-11-28).
 */
export function skillSnapshot(results: ResultForDash[], writingBand: number | null): SkillSnapshot[] {
  const of = (skill: SkillKey) =>
    results.filter((r) => r.skill === skill && r.band != null).map((r) => Number(r.band));
  const recentAvg = (xs: number[]) =>
    xs.length ? roundHalf(xs.slice(0, RECENT).reduce((a, b) => a + b, 0) / Math.min(xs.length, RECENT)) : null;
  const writingResults = of("writing");
  return [
    { key: "reading", band: recentAvg(of("reading")), count: of("reading").length },
    { key: "listening", band: recentAvg(of("listening")), count: of("listening").length },
    {
      key: "writing",
      band: writingBand ?? recentAvg(writingResults),
      count: writingBand != null ? Math.max(1, writingResults.length) : writingResults.length,
    },
  ];
}

/** Mean of the skills that have a band, IELTS-rounded. Null when none. */
export function estimatedOverall(snap: SkillSnapshot[]): { band: number | null; skills: number } {
  const bands = snap.map((s) => s.band).filter((b): b is number => b != null);
  return {
    band: bands.length ? roundHalf(bands.reduce((a, b) => a + b, 0) / bands.length) : null,
    skills: bands.length,
  };
}

/** A live streak that ends tonight unless the student practises today. */
export function streakAtRisk(streak: number, practisedToday: boolean): boolean {
  return streak > 0 && !practisedToday;
}

/** "Good morning" / "Good afternoon" / "Good evening" in the student's zone. */
export function greeting(tz: string | null | undefined, now: number = Date.now()): string {
  let hour: number;
  try {
    hour = Number(new Date(now).toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone: tz || "UTC" }));
  } catch {
    hour = new Date(now).getUTCHours();
  }
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 18) return "Good afternoon";
  return "Good evening";
}

