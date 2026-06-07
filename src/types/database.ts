// Hand-written DB types matching supabase/migrations/0001_init.sql.
// Regenerate later with: npx supabase gen types typescript --project-id <ref>

export type Skill = "reading" | "listening" | "writing" | "speaking";
export type Role = "student" | "admin";

export type Profile = {
  id: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
  role: Role;
  is_owner: boolean;
  premium_until: string | null; // ISO date; active premium while in the future
  premium_announce: boolean; // show the one-time "you're premium" congrats
  streak: number;
  longest_streak: number;
  last_activity_date: string | null;
  xp: number;
  created_at: string;
};

export type Test = {
  id: string;
  title: string;
  skill: "reading" | "listening";
  kind: "single" | "full"; // single passage/section, or a full test
  tier: "free" | "premium";
  question_types: string[];
  level: string | null;
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
  submitted_at: string;
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
    };
    Functions: {
      record_activity: {
        Args: { p_xp?: number };
        Returns: { streak: number; longest_streak: number; xp: number }[];
      };
      is_admin: { Args: { uid: string }; Returns: boolean };
    };
  };
};
