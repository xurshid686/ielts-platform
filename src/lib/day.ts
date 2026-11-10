/**
 * Calendar-day helpers.
 *
 * The platform is timezone-aware on purpose: `profiles.timezone` decides when
 * a student's day rolls over, and `record_activity()` closes the streak day in
 * it (migration 0018). Anything else that asks "was this today?" has to agree,
 * or the streak and the thing celebrating it disagree — which is what happened
 * when saveResult() sliced a UTC ISO string and told a UTC+5 student their
 * 01:00 test belonged to yesterday.
 */

/**
 * The calendar day for an instant, in the given IANA timezone.
 *
 * Returns `YYYY-MM-DD`, which is what `profiles.last_activity_date` stores and
 * what `submitted_at::date` compares against. `en-CA` is simply the shortest
 * locale that formats that way.
 *
 * An unusable timezone falls back to UTC rather than throwing. A bad IANA
 * string is already enough to break `record_activity()` server-side; it must
 * not also be able to stop someone saving a finished test.
 */
export function localDay(timezone: string | null | undefined, at: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(at);
  } catch {
    return at.toISOString().slice(0, 10);
  }
}

/** The calendar day before a `YYYY-MM-DD` day. Pure date arithmetic, so a
 *  23- or 25-hour DST day cannot skip or repeat a date. */
export function previousDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * The streak a student actually HAS right now.
 *
 * `profiles.streak` is only rewritten by `record_activity_for()` when the
 * student next does something, so for anyone who stopped practising it keeps
 * the last value for ever: in November 2026, 547 accounts stored a streak
 * above zero with nothing done in days, and the dashboard told them to "keep
 * your N-day streak alive". A streak is alive only if the last activity was
 * today or yesterday in the student's own timezone (yesterday still counts:
 * they have until midnight to extend it).
 *
 * Display only. Nothing writes this back; the stored column is corrected by
 * the database on the student's next activity.
 */
export function liveStreak(
  streak: number | null | undefined,
  lastActivityDate: string | null | undefined,
  timezone: string | null | undefined,
  at: Date = new Date(),
): number {
  if (!streak || streak < 0 || !lastActivityDate) return 0;
  const today = localDay(timezone, at);
  const last = lastActivityDate.slice(0, 10);
  // A date ahead of "today" (profile timezone changed) is treated as today.
  return last >= previousDay(today) ? streak : 0;
}
