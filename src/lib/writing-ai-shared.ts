// AI writing checks (Axiom) — the PURE part: month keys, band maths and the
// shape a check is stored in. It imports NOTHING so it can be unit-tested without
// a `@/` alias (the discipline-shared / mock-shared rule) and used from client
// components. The server half is src/lib/writing-ai.ts.

/** Premium students' practice checks per calendar month (owner decision, 2026-11-14). */
export const MONTHLY_CHECKS = 10;

export type CriterionKey = "ta" | "cc" | "lr" | "gra";

export type AiRevision = { original: string; revised: string };

export type AiCriterion = {
  key: CriterionKey;
  label: string;
  /** Axiom's band for this criterion; null when it could not be read. */
  band: number | null;
  description: string;
  suggestions: string[];
  revisions: AiRevision[];
};

/** One task's result, in the shape stored in `writing_ai_checks.results`. */
export type AiTaskResult = {
  task: 1 | 2;
  axiomId: string;
  overall: number | null;
  criteria: AiCriterion[];
};

// Axiom's own keys -> ours, in the order the IELTS descriptors list them.
const AXIOM_KEYS: { axiom: string; key: CriterionKey }[] = [
  { axiom: "Task_Achievement", key: "ta" },
  { axiom: "Cohesion_and_Coherence", key: "cc" },
  { axiom: "Lexical_Resource", key: "lr" },
  { axiom: "Grammatical_Range_and_Accuracy", key: "gra" },
];

/** Axiom uses "Task_Achievement" for both tasks; the IELTS name for Task 2 is Task Response. */
export function criterionLabel(key: CriterionKey, task: 1 | 2): string {
  switch (key) {
    case "ta":
      return task === 1 ? "Task Achievement" : "Task Response";
    case "cc":
      return "Coherence and Cohesion";
    case "lr":
      return "Lexical Resource";
    case "gra":
      return "Grammatical Range and Accuracy";
  }
}

/** "8.0", "4", 7.5 -> a number in 0..9, else null. */
export function parseBand(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number.parseFloat(v.trim()) : Number.NaN;
  if (!Number.isFinite(n) || n < 0 || n > 9) return null;
  return n;
}

/** Nearest half band (the only step the owner's grade form accepts). */
export function roundHalf(n: number): number {
  return Math.round(n * 2) / 2;
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);

function revisions(v: unknown): AiRevision[] {
  if (!Array.isArray(v)) return [];
  const out: AiRevision[] = [];
  for (const r of v) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const original = str(o.sentenceExample);
    const revised = str(o.revision);
    if (original && revised) out.push({ original, revised });
  }
  return out;
}

/**
 * Axiom's `evaluation` JSON (already parsed) -> our criteria, always four, always
 * in IELTS order. A criterion Axiom did not return comes back with a null band
 * and no text rather than being dropped, so the card never silently loses a row.
 */
export function buildCriteria(task: 1 | 2, feedback: Record<string, unknown> | null): AiCriterion[] {
  return AXIOM_KEYS.map(({ axiom, key }) => {
    const raw = feedback?.[axiom];
    const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    return {
      key,
      label: criterionLabel(key, task),
      band: parseBand(o.Score),
      description: str(o.Description),
      suggestions: strList(o.Suggestions),
      revisions: revisions(o.Revisions),
    };
  });
}

/** Mean of the criteria Axiom scored, to the nearest half — only used if Axiom gave no overall. */
export function overallFromCriteria(criteria: AiCriterion[]): number | null {
  const bands = criteria.map((c) => c.band).filter((b): b is number => b != null);
  if (!bands.length) return null;
  return roundHalf(bands.reduce((a, b) => a + b, 0) / bands.length);
}

/** Narrow a jsonb value from the database to our results shape; anything else -> []. */
export function asResults(v: unknown): AiTaskResult[] {
  if (!Array.isArray(v)) return [];
  const out: AiTaskResult[] = [];
  for (const t of v) {
    if (!t || typeof t !== "object") continue;
    const o = t as Record<string, unknown>;
    if ((o.task !== 1 && o.task !== 2) || !Array.isArray(o.criteria)) continue;
    const task = o.task;
    out.push({
      task,
      axiomId: str(o.axiomId),
      overall: parseBand(o.overall),
      criteria: (o.criteria as unknown[]).map((c) => {
        const x = (c && typeof c === "object" ? c : {}) as Record<string, unknown>;
        const key = (["ta", "cc", "lr", "gra"] as const).find((k) => k === x.key) ?? "ta";
        return {
          key,
          label: criterionLabel(key, task),
          band: parseBand(x.band),
          description: str(x.description),
          suggestions: strList(x.suggestions),
          revisions: Array.isArray(x.revisions)
            ? (x.revisions as unknown[]).flatMap((r) => {
                const y = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
                const original = str(y.original);
                const revised = str(y.revised);
                return original && revised ? [{ original, revised }] : [];
              })
            : [],
        };
      }),
    });
  }
  return out;
}

/**
 * What a STUDENT may see of a mock check: Axiom's words, never its numbers. The
 * owner's own bands are the only numbers a mock student receives, so a
 * discouraging Axiom score can be corrected before anyone sees it.
 */
export function withoutBands(results: AiTaskResult[]): AiTaskResult[] {
  return results.map((t) => ({ ...t, overall: null, criteria: t.criteria.map((c) => ({ ...c, band: null })) }));
}

/** The owner's grade-form pre-fill: each task's overall, to the nearest half band. */
export function draftBands(results: AiTaskResult[]): { task1: number | null; task2: number | null } {
  const pick = (n: 1 | 2) => {
    const t = results.find((r) => r.task === n);
    if (!t) return null;
    const o = t.overall ?? overallFromCriteria(t.criteria);
    return o == null ? null : roundHalf(o);
  };
  return { task1: pick(1), task2: pick(2) };
}

/** Plain-text feedback for the owner's feedback box: each criterion's comment, per task. */
export function draftFeedbackText(results: AiTaskResult[], max = 5000): string {
  const parts: string[] = [];
  for (const t of results) {
    parts.push(`Task ${t.task}`);
    for (const c of t.criteria) {
      if (!c.description) continue;
      parts.push(`${c.label}: ${c.description}`);
      for (const s of c.suggestions) parts.push(`  - ${s}`);
    }
    parts.push("");
  }
  const text = parts.join("\n").trim();
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

// ------------------------------------------------------------------- the month

/** `YYYY-MM` from a `YYYY-MM-DD` day (what localDay() returns). */
export function monthKey(day: string): string {
  return day.slice(0, 7);
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "1 December" for the month after `YYYY-MM` — when the allowance renews. */
export function renewsOn(month: string): string {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return "next month";
  return `1 ${MONTHS[m % 12]}`;
}

export type CheckQuota = {
  used: number;
  limit: number;
  left: number;
  month: string;
  renews: string;
};

export function quotaOf(used: number, month: string, limit = MONTHLY_CHECKS): CheckQuota {
  const u = Math.max(0, Math.floor(used));
  return { used: u, limit, left: Math.max(0, limit - u), month, renews: renewsOn(month) };
}
