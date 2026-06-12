// Hand-written DB types matching supabase/migrations/0001_init.sql.
// Regenerate later with: npx supabase gen types typescript --project-id <ref>

export type Skill = "reading" | "listening" | "writing" | "speaking";
export type Role = "student" | "admin";
/** A student's learning track. Beginners get a tailored materials menu. */
export type Level = "regular" | "pre_ielts" | "intro";

export type Profile = {
  id: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
  role: Role;
  level: Level; // learning track (migration 0021); 'regular' = full IELTS
  is_owner: boolean;
  premium_until: string | null; // ISO date; active premium while in the future
  premium_announce: boolean; // show the one-time "you're premium" congrats
  target_band: number | null; // the student's goal band (1.0–9.0), or null
  streak: number;
  longest_streak: number;
  last_activity_date: string | null;
  xp: number;
  rating: number; // competitive Reading rating (Bronze … Legend)
  peak_rating: number; // highest rating ever reached
  rated_count: number; // # of first-attempt, rated reading tests
  timezone: string; // IANA tz (e.g. 'Asia/Tashkent'); drives streak/report day boundaries
  referral_code: string | null; // the user's own shareable invite code (migration 0019)
  referred_by: string | null; // profile id of whoever invited this user, or null
  hidden_from_leaderboard: boolean; // admin can temporarily hide from rating (migration 0020)
  created_at: string;
};

export type Referral = {
  id: string;
  referrer_id: string;
  referred_id: string;
  status: "pending" | "qualified";
  reward_months: number;
  created_at: string;
  qualified_at: string | null;
};

export type Test = {
  id: string;
  title: string;
  skill: "reading" | "listening";
  kind: "single" | "full"; // single passage/section, or a full test
  tier: "free" | "premium";
  question_types: string[];
  times_done: number; // total completions across all users
  difficulty: number; // self-tuning Elo difficulty (reading); 1500 = average
  level: string | null; // free-text band label shown on the card, e.g. "Band 6–7"
  track: Level; // audience: 'regular' (normal pages) | 'pre_ielts' | 'intro' (migration 0021)
  passage: number | null; // reading single only: 1, 2 or 3
  file_url: string;
  file_path: string;
  // Answer key for server-side grading: { "1": ["terminal"], ... }. NULL for
  // legacy tests where no key could be extracted (falls back to client score).
  answer_key: Record<string, string[]> | null;
  total: number | null; // number of gradeable questions
  created_by: string | null;
  created_at: string;
};

export type Result = {
  id: string;
  user_id: string;
  test_id: string | null;
  skill: Skill;
  raw: number | null;
  total: number | null;
  band: number | null;
  // Submitted answers for review: { "1": "terminal", ... }. NULL for legacy
  // results saved before migration 0013.
  answers: Record<string, string> | null;
  // Ranking bookkeeping (migration 0016). Only the first attempt of a
  // server-graded reading test is `rated`; retakes/flagged runs are not.
  duration_seconds: number | null;
  rated: boolean;
  points: number; // weekly/monthly points earned (>= 0)
  rating_before: number | null;
  rating_after: number | null;
  rating_delta: number | null;
  flagged: boolean;
  flag_reason: string | null;
  submitted_at: string;
};

export type Achievement = {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: "rating" | "activity" | "accuracy" | "streak";
  threshold: number | null;
  sort: number;
};

export type UserAchievement = {
  user_id: string;
  achievement_id: string;
  earned_at: string;
};

export type Notification = {
  id: string;
  user_id: string;
  type: "weekly_report" | "info" | "referral" | string;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
};

export type WeeklyReport = {
  id: string;
  user_id: string;
  period_start: string; // Monday (ISO date)
  period_end: string; // Sunday (ISO date)
  tests_completed: number;
  avg_band: number | null;
  best_band: number | null;
  avg_accuracy: number | null; // percent
  points: number;
  rating_start: number | null;
  rating_end: number | null;
  rating_delta: number;
  new_achievements: number;
  streak: number;
  generated_by: "auto" | "admin";
  created_at: string;
};

// Safe public projection exposed by the leaderboard_* views (no email/auth).
export type LeaderboardGlobalRow = {
  id: string;
  name: string | null;
  avatar_url: string | null;
  rating: number;
  peak_rating: number;
  rated_count: number;
  tests_completed: number;
  rank: number;
};

export type LeaderboardPeriodRow = {
  id: string;
  name: string | null;
  avatar_url: string | null;
  rating: number;
  points: number;
  tests: number;
  rank: number;
};

// Shape returned by the public_profile(uuid) RPC — safe, no PII.
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

export type ProfileStats = {
  id: string;
  rating: number;
  peak_rating: number;
  rated_count: number;
  reading_attempts: number;
  total_attempts: number;
  total_questions: number;
  total_correct: number;
  first_attempt_avg_band: number | null;
  best_band: number | null;
};

export type WritingSubmission = {
  id: string;
  user_id: string;
  task_type: "task1" | "task2";
  prompt: string | null;
  content: string | null;
  score: number | null;
  feedback: unknown | null;
  status: "draft" | "submitted";
  created_at: string;
};

// Per-criterion band + a short comment, as returned by Gemini.
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

export type SpeakingSubmission = {
  id: string;
  user_id: string;
  prompt: string | null;
  topic: string | null;
  audio_url: string | null;
  audio_path: string | null;
  audio_paths: string[] | null;
  score: number | null; // overall band
  feedback: SpeakingFeedback | null;
  created_at: string;
};

type Row<T> = T;
type Insert<T> = Partial<T>;
type Update<T> = Partial<T>;

export type Database = {
  public: {
    Tables: {
      profiles: { Row: Row<Profile>; Insert: Insert<Profile>; Update: Update<Profile> };
      tests: { Row: Row<Test>; Insert: Insert<Test>; Update: Update<Test> };
      results: { Row: Row<Result>; Insert: Insert<Result>; Update: Update<Result> };
      writing_submissions: {
        Row: Row<WritingSubmission>;
        Insert: Insert<WritingSubmission>;
        Update: Update<WritingSubmission>;
      };
      speaking_submissions: {
        Row: Row<SpeakingSubmission>;
        Insert: Insert<SpeakingSubmission>;
        Update: Update<SpeakingSubmission>;
      };
      achievements: { Row: Row<Achievement>; Insert: Insert<Achievement>; Update: Update<Achievement> };
      user_achievements: {
        Row: Row<UserAchievement>;
        Insert: Insert<UserAchievement>;
        Update: Update<UserAchievement>;
      };
    };
    Functions: {
      record_activity: {
        Args: { p_xp?: number };
        Returns: { streak: number; longest_streak: number; xp: number }[];
      };
      is_admin: { Args: { uid: string }; Returns: boolean };
      apply_rating: {
        Args: { p_result_id: string };
        Returns: {
          rated: boolean;
          rating: number | null;
          rating_delta: number;
          points: number;
          flagged: boolean;
          reason: string | null;
        }[];
      };
    };
  };
};
