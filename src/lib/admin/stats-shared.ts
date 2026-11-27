// Pure helpers for the admin analytics (no imports: unit-tested without the
// `@/` alias, the discipline-shared.ts rule). The numbers themselves come from
// admin_dashboard_stats() (migration 0076); this only shapes and labels them.

export type Range = 7 | 30 | 90;
export const RANGES: Range[] = [7, 30, 90];

export function asRange(v: string | string[] | undefined): Range {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return n === 7 || n === 90 ? n : 30;
}

export type PeriodNumbers = {
  signups: number;
  activated: number;
  results: number;
  active: number;
  paid: number;
  revenue: number;
  passes: number;
  trials: number;
};

export type SeriesPoint = {
  day: string;
  signups: number;
  results: number;
  active: number;
  paid: number;
  revenue: number;
  passes: number;
};

export type Cohort = { week: string; signups: number; took_test: number; returned: number; premium: number };

export type DashboardStats = {
  days: number;
  totals: {
    accounts: number;
    new_7d: number;
    new_30d: number;
    premium_active: number;
    ultima_active: number;
    trials_active: number;
    results_total: number;
    tests_total: number;
    premium_expiring_7d: number;
    oldest_ungraded_at: string | null;
    oldest_open_report_at: string | null;
    orders_stuck: number;
  };
  period: { cur: PeriodNumbers; prev: PeriodNumbers };
  series: SeriesPoint[];
  cohorts: Cohort[];
  catalogue: { skill: string; tier: string; n: number }[];
};

/** Percentage change, or null when there is no base to compare with. */
export function pctDelta(cur: number, prev: number): number | null {
  if (!Number.isFinite(cur) || !Number.isFinite(prev) || prev <= 0) return null;
  return Math.round(((cur - prev) / prev) * 100);
}

/** "+12%" / "−8%" / "0%" — a real minus sign, so the column lines up. */
export function formatDelta(d: number | null): string {
  if (d == null) return "new";
  if (d === 0) return "0%";
  return `${d > 0 ? "+" : "−"}${Math.abs(d)}%`;
}

/** A share in whole percent; 0 when the base is empty. */
export function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

/** 1234567 -> "1 234 567" (so'm are written with thin groups in Uzbekistan). */
export function groupDigits(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** Compact age for a backlog item: "3 h", "2 d", "10 wk". */
export function ageLabel(iso: string | null, now: number): string | null {
  if (!iso) return null;
  const ms = now - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const h = ms / 3_600_000;
  if (h < 1) return `${Math.max(1, Math.round(ms / 60_000))} min`;
  if (h < 48) return `${Math.round(h)} h`;
  const d = h / 24;
  if (d < 21) return `${Math.round(d)} d`;
  return `${Math.round(d / 7)} wk`;
}

/** Narrow the RPC's JSON. Anything missing becomes 0 / [] rather than a crash. */
export function asDashboardStats(raw: unknown): DashboardStats {
  const o = (raw ?? {}) as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);
  const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
  const arr = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);
  const period = (v: unknown): PeriodNumbers => {
    const p = obj(v);
    return {
      signups: n(p.signups),
      activated: n(p.activated),
      results: n(p.results),
      active: n(p.active),
      paid: n(p.paid),
      revenue: n(p.revenue),
      passes: n(p.passes),
      trials: n(p.trials),
    };
  };
  const t = obj(o.totals);
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  return {
    days: n(o.days),
    totals: {
      accounts: n(t.accounts),
      new_7d: n(t.new_7d),
      new_30d: n(t.new_30d),
      premium_active: n(t.premium_active),
      ultima_active: n(t.ultima_active),
      trials_active: n(t.trials_active),
      results_total: n(t.results_total),
      tests_total: n(t.tests_total),
      premium_expiring_7d: n(t.premium_expiring_7d),
      oldest_ungraded_at: str(t.oldest_ungraded_at),
      oldest_open_report_at: str(t.oldest_open_report_at),
      orders_stuck: n(t.orders_stuck),
    },
    period: { cur: period(obj(o.period).cur), prev: period(obj(o.period).prev) },
    series: arr(o.series).map((s) => ({
      day: String(s.day ?? ""),
      signups: n(s.signups),
      results: n(s.results),
      active: n(s.active),
      paid: n(s.paid),
      revenue: n(s.revenue),
      passes: n(s.passes),
    })),
    cohorts: arr(o.cohorts).map((c) => ({
      week: String(c.week ?? ""),
      signups: n(c.signups),
      took_test: n(c.took_test),
      returned: n(c.returned),
      premium: n(c.premium),
    })),
    catalogue: arr(o.catalogue).map((c) => ({ skill: String(c.skill), tier: String(c.tier), n: n(c.n) })),
  };
}

// ------------------------------------------------------------ tests table

/** Tracks a test may be MOVED between from the tests table. Discipline and
 *  mock papers have their own attachment and access rules (a discipline paper
 *  must sit on a day, a mock paper is served only inside a sitting), so they
 *  never move in or out of here. */
export const EDITABLE_TRACKS = ["regular", "pre_ielts", "intro"] as const;
export type EditableTrack = (typeof EDITABLE_TRACKS)[number];

export function canRetrack(from: string | null | undefined, to: string): boolean {
  const f = from ?? "regular";
  return (
    (EDITABLE_TRACKS as readonly string[]).includes(f) && (EDITABLE_TRACKS as readonly string[]).includes(to)
  );
}
