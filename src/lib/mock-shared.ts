// The Mock exam section (migration 0050) — the parts both the server and the
// client need.
//
// Imports NOTHING, on purpose: the same constraint as discipline-shared.ts.
// There is no vitest `@/` alias, and `src/lib/mock.ts` is `server-only` (it
// holds the service-role client), so anything a client component or a unit
// test needs lives here.

export type MockAttemptStatus = "approved" | "in_progress" | "submitted" | "released";
export type MockRequestStatus = "pending" | "approved" | "rejected";
export type MockSection = "listening" | "reading" | "writing";

/** The real exam's order. A section opens only once the one before it is submitted. */
export const SECTION_ORDER: MockSection[] = ["listening", "reading", "writing"];

/**
 * A mock's sitting (0054). `waiting`: places can be approved, nobody can start.
 * `running`: every approved student may start. `closed`: nobody new starts;
 * students already inside finish.
 */
export type SessionState = "waiting" | "running" | "closed";

export const SESSION_LABEL: Record<SessionState, string> = {
  waiting: "Waiting to start",
  running: "Session running",
  closed: "Session ended",
};

export function asSessionState(v: unknown): SessionState {
  return v === "running" || v === "closed" ? v : "waiting";
}

/**
 * May this attempt START something new (the mock, a section, a video)?
 * Null = yes; otherwise the reason, in the student's words.
 *
 * The owner's rule: a running session admits everyone approved; a closed one
 * lets a student who is already inside (status in_progress) finish.
 */
export function admissionError(sessionState: SessionState, attemptStatus: string): string | null {
  if (sessionState === "running") return null;
  if (sessionState === "closed" && attemptStatus === "in_progress") return null;
  return sessionState === "waiting"
    ? "Your teacher hasn't started the session yet. This page will open it as soon as they do."
    : "This mock session has ended.";
}

/** The watched-enough rule for an instruction video: server time since it first played. */
export function videoWatchedEnough(startedAtMs: number | null, durationS: number, nowMs: number): boolean {
  if (startedAtMs == null || !Number.isFinite(durationS) || durationS <= 0) return false;
  return (nowMs - startedAtMs) / 1000 >= durationS * 0.9 - 2;
}

export const MAX_REQUEST_MESSAGE = 300;
/** A generous cap: a Task 2 essay is ~250–400 words, about 2–3 KB. */
export const MAX_ESSAY_CHARS = 20_000;

export const TASK1_MIN_WORDS = 150;
export const TASK2_MIN_WORDS = 250;

/**
 * Rounds a mean band the way IELTS rounds the Overall Band Score:
 * a fraction below .25 rounds down to the whole band, .25 up to below .75 rounds
 * to the half band, and .75 or above rounds up to the next whole band.
 *
 *   6.125 -> 6.0,  6.25 -> 6.5,  6.625 -> 6.5,  6.75 -> 7.0
 *
 * The epsilon absorbs floating-point error in the mean ((6 + 6.5 + 6.75) / 3 is
 * not exactly representable), which would otherwise round a true .25 down.
 */
export function roundBand(value: number): number {
  const whole = Math.floor(value + 1e-9);
  const frac = value - whole;
  if (frac < 0.25 - 1e-9) return whole;
  if (frac < 0.75 - 1e-9) return whole + 0.5;
  return whole + 1;
}

/**
 * Overall band from the section bands that exist. Null until every one of
 * listening, reading and writing has a band — an overall computed from two
 * sections would be published as if it described the whole exam.
 */
export function overallBand(bands: {
  listening: number | null;
  reading: number | null;
  writing: number | null;
}): number | null {
  const { listening, reading, writing } = bands;
  if (listening == null || reading == null || writing == null) return null;
  return roundBand((listening + reading + writing) / 3);
}

/**
 * The writing band from the two task bands. Task 2 carries twice the weight of
 * Task 1, as in the real marking. The owner can override the result.
 */
export function writingBand(task1: number | null, task2: number | null): number | null {
  if (task1 == null || task2 == null) return null;
  return roundBand((task1 + 2 * task2) / 3);
}

/** A valid band: 0–9 in half steps. */
export function isBand(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 9 &&
    Number.isInteger(value * 2)
  );
}

/** Words as an examiner counts them: whitespace-separated tokens. */
export function countWords(text: string | null | undefined): number {
  if (!text) return 0;
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/**
 * Which section the student should be on next, or null once all three are
 * submitted. Pure, so the page, the gate and the tests agree.
 */
export function nextSection(attempt: {
  listening_submitted_at: string | null;
  reading_submitted_at: string | null;
  writing_submitted_at: string | null;
}): MockSection | null {
  if (!attempt.listening_submitted_at) return "listening";
  if (!attempt.reading_submitted_at) return "reading";
  if (!attempt.writing_submitted_at) return "writing";
  return null;
}

export const STATUS_LABEL: Record<MockAttemptStatus, string> = {
  approved: "Approved — not started",
  in_progress: "In progress",
  submitted: "Submitted — awaiting results",
  released: "Results released",
};

// ------------------------------------------------------------ admin workflow

/**
 * Where an attempt sits in the OWNER's workflow — finer than the stored status.
 * `submitted` in the database covers two very different jobs: essays nobody has
 * marked yet, and marked results waiting to be released. The admin panel's
 * counts, filters and row actions all key off this, so they cannot disagree.
 */
export type AdminStage =
  | "not_started"
  | "listening"
  | "reading"
  | "writing"
  | "needs_grading"
  | "ready_to_release"
  | "released";

export function adminStage(a: {
  status: string;
  started_at: string | null;
  listening_submitted_at: string | null;
  reading_submitted_at: string | null;
  writing_submitted_at: string | null;
  writing_band: number | null;
  overall_band: number | null;
}): AdminStage {
  if (a.status === "released") return "released";
  if (a.status === "submitted") {
    return a.writing_band != null && a.overall_band != null ? "ready_to_release" : "needs_grading";
  }
  if (a.status === "approved" && !a.started_at) return "not_started";
  return nextSection(a) ?? "writing";
}

export const STAGE_LABEL: Record<AdminStage, string> = {
  not_started: "Not started",
  listening: "On Listening",
  reading: "On Reading",
  writing: "On Writing",
  needs_grading: "Needs grading",
  ready_to_release: "Ready to release",
  released: "Released",
};

/** Stages grouped the way the owner filters: what needs me, what is running, what is done. */
export const STAGE_GROUPS = {
  needs_grading: ["needs_grading"],
  ready_to_release: ["ready_to_release"],
  in_progress: ["listening", "reading", "writing"],
  not_started: ["not_started"],
  released: ["released"],
} as const satisfies Record<string, readonly AdminStage[]>;

export type StageGroup = keyof typeof STAGE_GROUPS;

/**
 * Neutralises a CSV cell. Quotes commas, quotes, CR and LF, and prefixes text
 * that a spreadsheet would run as a formula (=, +, -, @, tab, CR) with an
 * apostrophe — student names are student-controlled.
 */
export function csvCell(v: unknown): string {
  let s = v == null ? "" : String(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Absolute date-time in the owner's timezone — mock records are read months later. */
export function tashkent(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: "Asia/Tashkent",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------- integrity
//
// Evidence for the TEACHER (0052). Nothing here ever changes a score, submits
// a section or blocks a student: the verdict only says "review suggested".
// A browser cannot see a second phone or a helper in the room, so these
// signals are triage, not proof — the meeting with Codex, Grok and agy was
// unanimous on that, and so is the owner.

/** Time outside fullscreen (or with the tab hidden) that counts as a real departure. */
export const LONG_AWAY_MS = 3_000;
/** A hidden tab shorter than this is a notification flicker, not a departure. */
export const HIDDEN_GRACE_MS = 2_000;
export const MAX_EVENTS = 300;

export type IntegrityEventType = "device" | "away" | "reload" | "second_tab" | "paste" | "seek_back" | "timeout";

export type IntegrityEvent = {
  /** Server receive time (ISO). Client clocks are not trusted for ordering. */
  t: string;
  type: IntegrityEventType;
  section: MockSection;
  /** away: how long, and why */
  ms?: number;
  kind?: "fullscreen" | "hidden";
  /** paste */
  words?: number;
  task?: 1 | 2;
  /** device */
  ua?: string;
  screen?: string;
};

export type Integrity = {
  counters: {
    away: number;
    long_away: number;
    away_ms: number;
    reloads: number;
    listening_reloads: number;
    second_tab: number;
    pastes: number;
    largest_paste_words: number;
    seek_back: number;
  };
  device: string | null;
  events: IntegrityEvent[];
};

export function emptyIntegrity(): Integrity {
  return {
    counters: {
      away: 0,
      long_away: 0,
      away_ms: 0,
      reloads: 0,
      listening_reloads: 0,
      second_tab: 0,
      pastes: 0,
      largest_paste_words: 0,
      seek_back: 0,
    },
    device: null,
    events: [],
  };
}

/** Narrow the jsonb column; anything malformed starts from empty rather than throwing. */
export function asIntegrity(value: unknown): Integrity {
  const base = emptyIntegrity();
  if (!value || typeof value !== "object") return base;
  const v = value as Partial<Integrity>;
  const counters = { ...base.counters };
  if (v.counters && typeof v.counters === "object") {
    for (const k of Object.keys(counters) as (keyof Integrity["counters"])[]) {
      const n = Number((v.counters as Record<string, unknown>)[k]);
      if (Number.isFinite(n) && n >= 0) counters[k] = n;
    }
  }
  return {
    counters,
    device: typeof v.device === "string" ? v.device : null,
    events: Array.isArray(v.events) ? (v.events as IntegrityEvent[]).slice(-MAX_EVENTS) : [],
  };
}

const SECTIONS = new Set<MockSection>(["listening", "reading", "writing"]);
const clampInt = (n: unknown, max: number) => {
  const x = Math.round(Number(n));
  return Number.isFinite(x) ? Math.min(Math.max(x, 0), max) : 0;
};

/**
 * Folds client-reported events into the stored record. Pure and defensive: the
 * input comes from the browser, so every field is validated and clamped, the
 * event list is capped, and unknown types are dropped. `now` is the SERVER
 * receive time stamped on every event.
 */
export function applyIntegrityEvents(current: Integrity, raw: unknown[], now: string): Integrity {
  const next: Integrity = { counters: { ...current.counters }, device: current.device, events: [...current.events] };
  for (const item of raw.slice(0, 50)) {
    if (!item || typeof item !== "object") continue;
    const e = item as Record<string, unknown>;
    const section = e.section as MockSection;
    if (!SECTIONS.has(section)) continue;
    const c = next.counters;
    let ev: IntegrityEvent | null = null;

    switch (e.type) {
      case "device": {
        const ua = String(e.ua ?? "").slice(0, 300);
        const screen = String(e.screen ?? "").slice(0, 40);
        next.device = `${ua}${screen ? ` · ${screen}` : ""}`;
        ev = { t: now, type: "device", section, ua, screen };
        break;
      }
      case "away": {
        const ms = clampInt(e.ms, 3 * 60 * 60 * 1000);
        const kind = e.kind === "hidden" ? "hidden" : "fullscreen";
        if (kind === "hidden" && ms < HIDDEN_GRACE_MS) break;
        c.away++;
        c.away_ms += ms;
        if (ms >= LONG_AWAY_MS) c.long_away++;
        ev = { t: now, type: "away", section, ms, kind };
        break;
      }
      case "second_tab":
        c.second_tab++;
        ev = { t: now, type: "second_tab", section };
        break;
      case "paste": {
        const words = clampInt(e.words, 100_000);
        if (words < 5) break;
        c.pastes++;
        c.largest_paste_words = Math.max(c.largest_paste_words, words);
        ev = { t: now, type: "paste", section, words, task: e.task === 2 ? 2 : 1 };
        break;
      }
      case "seek_back":
        c.seek_back++;
        ev = { t: now, type: "seek_back", section };
        break;
      default:
        break;
    }
    if (ev) next.events.push(ev);
  }
  next.events = next.events.slice(-MAX_EVENTS);
  return next;
}

/** Server-side reload bookkeeping — the client cannot be trusted to report its own reload. */
export function recordReload(current: Integrity, section: MockSection, now: string): Integrity {
  const next = asIntegrity(current);
  next.counters.reloads++;
  if (section === "listening") next.counters.listening_reloads++;
  next.events = [...next.events, { t: now, type: "reload" as const, section }].slice(-MAX_EVENTS);
  return next;
}

/** Server-side: a section closed by the clock rather than by the student. */
export function recordTimeout(current: Integrity, section: MockSection, now: string): Integrity {
  const next = asIntegrity(current);
  next.events = [...next.events, { t: now, type: "timeout" as const, section }].slice(-MAX_EVENTS);
  return next;
}

export type IntegrityVerdict = { level: "clear" | "review" | "incomplete"; reasons: string[] };

export type SectionTiming = {
  section: MockSection;
  startedAt: string | null;
  submittedAt: string | null;
  minutes: number | null;
};

/**
 * "Review suggested" is a prompt for the teacher to look, never an accusation.
 * "Incomplete" means monitoring did not run (no device report) — e.g. an attempt
 * from before 0052, or scripts blocked — so the absence of flags proves nothing.
 */
export function integrityVerdict(integrity: Integrity, timings: SectionTiming[] = []): IntegrityVerdict {
  const c = integrity.counters;
  const reasons: string[] = [];
  if (c.long_away >= 3) reasons.push(`Left fullscreen or the tab ${c.long_away} times`);
  if (c.away_ms >= 60_000) reasons.push(`${Math.round(c.away_ms / 1000)} s away from the exam in total`);
  if (c.second_tab > 0) reasons.push("Opened the exam in a second tab");
  if (c.listening_reloads > 0) reasons.push(`Reloaded during Listening (${c.listening_reloads}×)`);
  if (c.largest_paste_words >= 100) reasons.push(`Pasted ${c.largest_paste_words} words at once in Writing`);
  if (c.seek_back >= 3) reasons.push("Tried to rewind the Listening audio");
  for (const s of timings) {
    if (!s.startedAt || !s.submittedAt || !s.minutes || s.section === "writing") continue;
    const took = new Date(s.submittedAt).getTime() - new Date(s.startedAt).getTime();
    if (took < s.minutes * 60_000 * 0.25) {
      reasons.push(`Finished ${s.section} in ${Math.max(1, Math.round(took / 60_000))} min of ${s.minutes}`);
    }
  }
  if (reasons.length) return { level: "review", reasons };
  if (!integrity.device) return { level: "incomplete", reasons: ["No monitoring data was received for this attempt"] };
  return { level: "clear", reasons: [] };
}

/**
 * Laptop/desktop only (owner's decision): a fine pointer, a large screen, and a
 * working element Fullscreen API. iPhone Safari has no element fullscreen, and
 * the CDI split-screen format is not usable on a phone anyway. A touch laptop
 * passes, because it also has a fine pointer.
 */
export function isExamCapableDevice(d: {
  finePointer: boolean;
  anyFinePointer: boolean;
  screenW: number;
  screenH: number;
  fullscreenEnabled: boolean;
}): boolean {
  const shortSide = Math.min(d.screenW, d.screenH);
  return d.fullscreenEnabled && (d.finePointer || d.anyFinePointer) && shortSide >= 700;
}
