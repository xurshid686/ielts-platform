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
