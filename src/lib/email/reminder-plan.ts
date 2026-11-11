// Who gets a reminder email on this run. Pure, so the rules are unit-tested:
//
//  - ONE email per student per day (owner, 2026-11-11). Candidates arrive in
//    priority order (the caller lists Premium first, then streak, then
//    inactive) and the first one for a student wins.
//  - Anyone already in today's log is skipped. The database enforces the same
//    rule with UNIQUE (user_id, sent_day); this just avoids a wasted insert.
//  - A daily CAP, because Resend's free plan sends 100 emails a day and mock
//    results share that allowance. Overflow is counted, never sent.
//
// Imports nothing (the mock-templates rule).

export const DAILY_REMINDER_CAP = 90;

/**
 * A streak EMAIL only goes to a streak this long (owner, 2026-11-11: "don't
 * send for small days"). Shorter live streaks still get the in-app
 * notification, which costs nothing.
 */
export const STREAK_EMAIL_MIN = 10;

export type Plan<T> = {
  send: T[];
  /** Same student listed twice in this run (a lower-priority reminder lost). */
  duplicates: number;
  /** Already emailed today, by an earlier run. */
  alreadyToday: number;
  /** Eligible, but over the daily cap. */
  overCap: number;
};

export function planReminders<T extends { userId: string }>(
  candidates: T[],
  alreadyToday: ReadonlySet<string>,
  sentToday: number,
  cap: number = DAILY_REMINDER_CAP,
): Plan<T> {
  const room = Math.max(0, cap - sentToday);
  const seen = new Set<string>();
  const plan: Plan<T> = { send: [], duplicates: 0, alreadyToday: 0, overCap: 0 };
  for (const c of candidates) {
    if (alreadyToday.has(c.userId)) {
      plan.alreadyToday++;
      continue;
    }
    if (seen.has(c.userId)) {
      plan.duplicates++;
      continue;
    }
    seen.add(c.userId);
    if (plan.send.length >= room) {
      plan.overCap++;
      continue;
    }
    plan.send.push(c);
  }
  return plan;
}
