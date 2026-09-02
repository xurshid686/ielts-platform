// The app's view of the database.
//
// Every table type here is DERIVED from `./supabase.ts`, which is generated
// from the live schema — so a renamed or dropped column is a compile error at
// the line that uses it, not a wrong assumption that survives to production.
// This file used to be hand-written "matching 0001_init.sql", 40 migrations
// behind, and described a `tests_public` view that never existed.
//
// What this file adds on top of the generated rows, and why:
//
//   - **Narrowed unions.** Postgres has `role text`, not an enum, so the
//     generated type is `string`. `Role`, `Skill`, `Level`, `tier` and friends
//     are the values the app actually writes. Narrowing here means a typo is
//     caught once, at the boundary.
//   - **Parsed JSON.** `answer_key`, `answers`, `feedback` and `study` are
//     `jsonb`, so the generator can only say `Json`. The real shapes are
//     documented below; `asAnswerKey` / `asAnswers` in lib/ielts/grade.ts are
//     the runtime narrowing that makes them safe to assert.
//
// Regenerate ./supabase.ts after every migration — see its header.

import type { Database as GeneratedDatabase } from "./supabase";

export type { Json } from "./supabase";

/**
 * Functions that exist in a migration but not yet in the live schema, so the
 * generator has not seen them.
 *
 * ⚠️ TEMPORARY. Each entry here is a promise the database has not made yet.
 * Delete an entry the moment its migration is applied and ./supabase.ts is
 * regenerated — the generated type is then the real one, and leaving a stale
 * override would hide a signature change.
 *
 * Currently pending:
 *   - `record_activity_for` — migration 0040. The service-role replacement for
 *     `record_activity`, which reads auth.uid() and so awards nothing when
 *     called with the service role. See CLAUDE.md, "Applying 0040 and 0041".
 *   - the four `*_as` variants — migration 0042. Applied to the live project,
 *     but ./supabase.ts has not been regenerated since (that needs a Supabase
 *     personal access token). Run `npm run types` and delete these.
 */
type PendingFunctions = {
  record_activity_for: {
    Args: { p_user_id: string; p_xp?: number };
    Returns: { longest_streak: number; streak: number; xp: number }[];
  };
  set_premium_as: {
    Args: { p_actor: string; target_email: string; months: number };
    Returns: { id: string; email: string; name: string | null; premium_until: string | null }[];
  };
  gift_xp_as: {
    Args: { p_actor: string; target_email: string; amount: number };
    Returns: { id: string; email: string; name: string | null; xp: number }[];
  };
  set_leaderboard_hidden_as: {
    Args: { p_actor: string; target_email: string; hidden: boolean };
    Returns: { id: string; email: string; name: string | null; hidden_from_leaderboard: boolean }[];
  };
  set_user_level_as: {
    Args: { p_actor: string; target_email: string; new_level: string };
    Returns: string;
  };
};

/**
 * Tables in the same position: applied to the database, absent from the
 * generated types until the next `npm run types`.
 *
 * ⚠️ TEMPORARY, on exactly the same terms as PendingFunctions — delete each
 * entry once ./supabase.ts has been regenerated. A stale override here is worse
 * than one in PendingFunctions, because it would hide a column change rather
 * than a signature change.
 *
 * Currently pending:
 *   - `telegram_sessions`, `telegram_updates` — migration 0042. Service-role
 *     only (RLS on, no policies, grants revoked from anon/authenticated).
 */
type PendingTable<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};

type PendingTables = {
  telegram_sessions: PendingTable<{
    chat_id: number;
    step: string;
    data: import("./supabase").Json;
    message_id: number | null;
    updated_at: string;
  }>;
  telegram_updates: PendingTable<{
    update_id: number;
    received_at: string;
  }>;
};

/** The generated schema, passed to every Supabase client. */
export type Database = Omit<GeneratedDatabase, "public"> & {
  public: Omit<GeneratedDatabase["public"], "Functions" | "Tables"> & {
    Functions: GeneratedDatabase["public"]["Functions"] & PendingFunctions;
    Tables: GeneratedDatabase["public"]["Tables"] & PendingTables;
  };
};

type Tables = GeneratedDatabase["public"]["Tables"];
type Views = GeneratedDatabase["public"]["Views"];

/** A table's row, exactly as the database returns it. */
type Row<T extends keyof Tables> = Tables[T]["Row"];

/** The shape an INSERT into a table accepts (optional columns, defaults applied). */
export type TablesInsert<T extends keyof Tables> = Tables[T]["Insert"];

/** The shape an UPDATE to a table accepts. */
export type TablesUpdate<T extends keyof Tables> = Tables[T]["Update"];

/**
 * A row with some columns replaced by a narrower type.
 *
 * `O`'s keys are constrained to the row's keys, so if a migration renames or
 * drops a column that is being narrowed here, THIS FILE fails to compile —
 * which is the whole point of deriving rather than restating.
 */
type Narrow<R, O extends Partial<Record<keyof R, unknown>>> = Omit<R, keyof O> & O;

/**
 * A view's row with the nulls taken back out.
 *
 * Postgres cannot express NOT NULL through a view, so every generated view
 * column is `T | null` even where the underlying column is non-null and the
 * view's own aggregates (rank, counts) can never be null. Narrowing here keeps
 * the column-name checking — a renamed view column still breaks the build —
 * without pushing false nulls into every consumer.
 */
type NonNullRow<R> = { [K in keyof R]: NonNullable<R[K]> };

/**
 * Narrows rows the client typed from the generated schema into the app's own
 * row types.
 *
 * A cast is genuinely needed here and cannot be designed away: `skill`, `role`,
 * `tier`, `track` and `status` are `text` columns, not Postgres enums, so the
 * generated type is `string`, while the app treats them as closed unions. The
 * same goes for `jsonb` columns, which generate as `Json`.
 *
 * What this replaces is seven scattered `as unknown as T[]` expressions that
 * asserted the same thing without saying so. Funnelling them through one named
 * helper keeps the assertion greppable and gives it somewhere to be explained.
 *
 * It is still an assertion, so it is only sound where the DB constrains the
 * values — a CHECK constraint, or the fact that only this app writes them.
 * Data arriving from outside that guarantee wants runtime narrowing instead
 * (`asAnswerKey` / `asAnswers` in lib/ielts/grade.ts).
 */
export function rows<T>(data: unknown[] | null | undefined): T[] {
  return (data ?? []) as T[];
}

/* -------------------------------------------------------------------------- */
/* Value unions — `text` columns in the database, closed sets in the app.      */
/* -------------------------------------------------------------------------- */

export type Skill = "reading" | "listening" | "writing" | "speaking";
export type Role = "student" | "admin";
/** A student's learning track. Beginners get a tailored materials menu. */
export type Level = "regular" | "pre_ielts" | "intro";

/* -------------------------------------------------------------------------- */
/* Tables                                                                      */
/* -------------------------------------------------------------------------- */

export type Profile = Narrow<
  Row<"profiles">,
  {
    role: Role;
    /** Learning track (migration 0021); 'regular' = the full IELTS catalogue. */
    level: Level;
  }
>;

export type Referral = Narrow<Row<"referrals">, { status: "pending" | "qualified" }>;

export type Test = Narrow<
  Row<"tests">,
  {
    skill: "reading" | "listening";
    /** A single passage/section, or a full test. */
    kind: "single" | "full";
    tier: "free" | "premium";
    /** Audience: 'regular' (the normal pages) | 'pre_ielts' | 'intro' (0021). */
    track: Level;
    /**
     * Answer key for server-side grading: `{ "1": ["terminal"], ... }`.
     *
     * Never sent to the browser: migration 0034 revokes column-level SELECT on
     * it (with file_path / file_url) from the client roles, so it is readable
     * only with the service-role client.
     *
     * NULL only on legacy rows uploaded before the key became mandatory. Those
     * can no longer be submitted at all — saveResult refuses a test with no
     * key, because a page-reported score is unverifiable — and must be
     * backfilled with scripts/backfill-keys.mjs.
     */
    answer_key: Record<string, string[]> | null;
  }
>;

export type Result = Narrow<
  Row<"results">,
  {
    skill: Skill;
    /**
     * Submitted answers for review: `{ "1": "terminal", ... }`.
     * NULL for legacy results saved before migration 0013.
     */
    answers: Record<string, string> | null;
  }
>;

export type Achievement = Narrow<
  Row<"achievements">,
  { category: "rating" | "activity" | "accuracy" | "streak" }
>;

export type UserAchievement = Row<"user_achievements">;

export type Notification = Narrow<
  Row<"notifications">,
  {
    type: "weekly_report" | "info" | "referral" | (string & {});
    data: Record<string, unknown> | null;
  }
>;

export type WeeklyReport = Narrow<Row<"weekly_reports">, { generated_by: "auto" | "admin" }>;

export type WritingSubmission = Narrow<
  Row<"writing_submissions">,
  { task_type: "task1" | "task2"; status: "draft" | "submitted" }
>;

/* -------------------------------------------------------------------------- */
/* Speaking                                                                    */
/* -------------------------------------------------------------------------- */

/** Per-criterion band + a short comment, as returned by Gemini. */
export type SpeakingCriterion = { band: number; comment: string };

export type SpeakingFeedback = {
  overallBand: number;
  criteria: {
    fluency: SpeakingCriterion; // Fluency & Coherence
    lexical: SpeakingCriterion; // Lexical Resource
    grammar: SpeakingCriterion; // Grammatical Range & Accuracy
    pronunciation: SpeakingCriterion;
  };
  strengths: string[];
  improvements: string[];
  partFeedback: { part: number; comment: string }[];
  transcript: string;
};

/**
 * Hand-authored practice material for a speaking topic (shared). Sample answers
 * mark key vocabulary/expressions/idioms with **double asterisks** for highlight.
 */
export type SpeakingStudy = {
  ideas: string[];
  samples: { prompt: string; versions: string[] }[]; // 3+ natural versions each
  vocabulary: { term: string; meaning: string; example: string }[];
  grammar: { point: string; example: string }[];
};

export type SpeakingSubmission = Narrow<
  Row<"speaking_submissions">,
  {
    /** Overall band. */
    score: number | null;
    feedback: SpeakingFeedback | null;
    audio_paths: string[] | null;
  }
>;

/** A speaking question in the browsable bank, mirrored from the Telegram channel. */
export type SpeakingQuestion = Narrow<
  Row<"speaking_questions">,
  {
    part: 1 | 2 | 3;
    /** Cached practice material; null until generated. */
    study: SpeakingStudy | null;
  }
>;

/* -------------------------------------------------------------------------- */
/* Views and RPC projections                                                   */
/* -------------------------------------------------------------------------- */

/** Safe public projection from the leaderboard_global view (no email/auth). */
export type LeaderboardGlobalRow = NonNullRow<Views["leaderboard_global"]["Row"]>;

/** leaderboard_weekly and leaderboard_monthly share a shape. */
export type LeaderboardPeriodRow = NonNullRow<Views["leaderboard_weekly"]["Row"]>;

export type ProfileStats = NonNullRow<Views["profile_stats"]["Row"]>;

/**
 * Shape returned by the `public_profile(uuid)` RPC — safe, no PII.
 *
 * Hand-written on purpose: the function returns `json`, so the generator can
 * only say `Json`. This is the contract the SQL actually builds; if you change
 * that function, change this with it.
 */
export type PublicProfile = {
  id: string;
  name: string | null;
  avatar_url: string | null;
  rating: number;
  peak_rating: number;
  rated_count: number;
  member_since: string;
  tests_completed: number;
  global_rank: number | null;
  best_band: number | null;
  history: { r: number; at: string }[];
  achievements: {
    id: string;
    name: string;
    icon: string;
    category: string;
    earned_at: string;
  }[];
};
