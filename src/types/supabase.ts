// GENERATED FILE — DO NOT EDIT BY HAND.
//
// Source of truth: the live Frankfurt project's schema.
// Regenerate after every migration:
//
//   SUPABASE_ACCESS_TOKEN=<token> npm run types
//
// The app-facing aliases (Profile, Test, Result, …) live in ./database.ts and
// are DERIVED from the Row types here, so a schema change surfaces as a type
// error at the point that uses it rather than as a silent wrong assumption.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      achievements: {
        Row: {
          category: string
          description: string
          icon: string
          id: string
          name: string
          sort: number
          threshold: number | null
        }
        Insert: {
          category: string
          description: string
          icon?: string
          id: string
          name: string
          sort?: number
          threshold?: number | null
        }
        Update: {
          category?: string
          description?: string
          icon?: string
          id?: string
          name?: string
          sort?: number
          threshold?: number | null
        }
        Relationships: []
      }
      ai_usage: {
        Row: {
          count: number
          day: string
          kind: string
          user_id: string
        }
        Insert: {
          count?: number
          day?: string
          kind: string
          user_id: string
        }
        Update: {
          count?: number
          day?: string
          kind?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_global"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_monthly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_weekly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      discipline_completions: {
        Row: {
          completed_at: string
          day_id: string
          result_id: string | null
          user_id: string
        }
        Insert: {
          completed_at?: string
          day_id: string
          result_id?: string | null
          user_id: string
        }
        Update: {
          completed_at?: string
          day_id?: string
          result_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "discipline_completions_day_id_fkey"
            columns: ["day_id"]
            isOneToOne: false
            referencedRelation: "discipline_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discipline_completions_result_id_fkey"
            columns: ["result_id"]
            isOneToOne: false
            referencedRelation: "results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discipline_completions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_global"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discipline_completions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_monthly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discipline_completions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_weekly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discipline_completions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discipline_completions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      discipline_day_tests: {
        Row: {
          day_id: string
          position: number
          test_id: string
        }
        Insert: {
          day_id: string
          position?: number
          test_id: string
        }
        Update: {
          day_id?: string
          position?: number
          test_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "discipline_day_tests_day_id_fkey"
            columns: ["day_id"]
            isOneToOne: false
            referencedRelation: "discipline_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discipline_day_tests_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "tests"
            referencedColumns: ["id"]
          },
        ]
      }
      discipline_days: {
        Row: {
          created_at: string
          day_number: number
          due_at: string | null
          id: string
          instructions: string | null
          published: boolean
          published_at: string | null
          title: string | null
        }
        Insert: {
          created_at?: string
          day_number: number
          due_at?: string | null
          id?: string
          instructions?: string | null
          published?: boolean
          published_at?: string | null
          title?: string | null
        }
        Update: {
          created_at?: string
          day_number?: number
          due_at?: string | null
          id?: string
          instructions?: string | null
          published?: boolean
          published_at?: string | null
          title?: string | null
        }
        Relationships: []
      }
      discipline_members: {
        Row: {
          current_day: number
          granted_at: string
          granted_by: string | null
          reset_at: string | null
          strikes: number
          user_id: string
        }
        Insert: {
          current_day?: number
          granted_at?: string
          granted_by?: string | null
          reset_at?: string | null
          strikes?: number
          user_id: string
        }
        Update: {
          current_day?: number
          granted_at?: string
          granted_by?: string | null
          reset_at?: string | null
          strikes?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "discipline_members_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "leaderboard_global"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discipline_members_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "leaderboard_monthly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discipline_members_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "leaderboard_weekly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discipline_members_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discipline_members_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discipline_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "leaderboard_global"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discipline_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "leaderboard_monthly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discipline_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "leaderboard_weekly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discipline_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profile_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discipline_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          data: Json | null
          id: string
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          data?: Json | null
          id?: string
          read_at?: string | null
          title: string
          type?: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          data?: Json | null
          id?: string
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_global"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_monthly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_weekly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          hidden_from_leaderboard: boolean
          id: string
          is_owner: boolean
          last_activity_date: string | null
          level: string
          longest_streak: number
          name: string | null
          peak_rating: number
          premium_announce: boolean
          premium_until: string | null
          rated_count: number
          rating: number
          referral_code: string | null
          referred_by: string | null
          role: string
          streak: number
          target_band: number | null
          timezone: string
          xp: number
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          hidden_from_leaderboard?: boolean
          id: string
          is_owner?: boolean
          last_activity_date?: string | null
          level?: string
          longest_streak?: number
          name?: string | null
          peak_rating?: number
          premium_announce?: boolean
          premium_until?: string | null
          rated_count?: number
          rating?: number
          referral_code?: string | null
          referred_by?: string | null
          role?: string
          streak?: number
          target_band?: number | null
          timezone?: string
          xp?: number
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          hidden_from_leaderboard?: boolean
          id?: string
          is_owner?: boolean
          last_activity_date?: string | null
          level?: string
          longest_streak?: number
          name?: string | null
          peak_rating?: number
          premium_announce?: boolean
          premium_until?: string | null
          rated_count?: number
          rating?: number
          referral_code?: string | null
          referred_by?: string | null
          role?: string
          streak?: number
          target_band?: number | null
          timezone?: string
          xp?: number
        }
        Relationships: [
          {
            foreignKeyName: "profiles_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "leaderboard_global"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "leaderboard_monthly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "leaderboard_weekly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          created_at: string
          id: string
          qualified_at: string | null
          referred_id: string
          referrer_id: string
          reward_months: number
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          qualified_at?: string | null
          referred_id: string
          referrer_id: string
          reward_months?: number
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          qualified_at?: string | null
          referred_id?: string
          referrer_id?: string
          reward_months?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrals_referred_id_fkey"
            columns: ["referred_id"]
            isOneToOne: true
            referencedRelation: "leaderboard_global"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referred_id_fkey"
            columns: ["referred_id"]
            isOneToOne: true
            referencedRelation: "leaderboard_monthly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referred_id_fkey"
            columns: ["referred_id"]
            isOneToOne: true
            referencedRelation: "leaderboard_weekly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referred_id_fkey"
            columns: ["referred_id"]
            isOneToOne: true
            referencedRelation: "profile_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referred_id_fkey"
            columns: ["referred_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_global"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_monthly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_weekly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      results: {
        Row: {
          answers: Json | null
          band: number | null
          duration_seconds: number | null
          flag_reason: string | null
          flagged: boolean
          id: string
          points: number
          rated: boolean
          rating_after: number | null
          rating_before: number | null
          rating_delta: number | null
          raw: number | null
          skill: string
          submitted_at: string
          test_id: string | null
          total: number | null
          user_id: string
        }
        Insert: {
          answers?: Json | null
          band?: number | null
          duration_seconds?: number | null
          flag_reason?: string | null
          flagged?: boolean
          id?: string
          points?: number
          rated?: boolean
          rating_after?: number | null
          rating_before?: number | null
          rating_delta?: number | null
          raw?: number | null
          skill: string
          submitted_at?: string
          test_id?: string | null
          total?: number | null
          user_id: string
        }
        Update: {
          answers?: Json | null
          band?: number | null
          duration_seconds?: number | null
          flag_reason?: string | null
          flagged?: boolean
          id?: string
          points?: number
          rated?: boolean
          rating_after?: number | null
          rating_before?: number | null
          rating_delta?: number | null
          raw?: number | null
          skill?: string
          submitted_at?: string
          test_id?: string | null
          total?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "results_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "tests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "results_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_global"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "results_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_monthly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "results_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_weekly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "results_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "results_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      speaking_completions: {
        Row: {
          completed_at: string
          question_id: string
          user_id: string
        }
        Insert: {
          completed_at?: string
          question_id: string
          user_id: string
        }
        Update: {
          completed_at?: string
          question_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "speaking_completions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "speaking_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      speaking_questions: {
        Row: {
          channel_link: string | null
          channel_message_id: number | null
          content: string
          created_at: string
          id: string
          number: string | null
          part: number
          study: Json | null
          title: string
        }
        Insert: {
          channel_link?: string | null
          channel_message_id?: number | null
          content?: string
          created_at?: string
          id?: string
          number?: string | null
          part: number
          study?: Json | null
          title?: string
        }
        Update: {
          channel_link?: string | null
          channel_message_id?: number | null
          content?: string
          created_at?: string
          id?: string
          number?: string | null
          part?: number
          study?: Json | null
          title?: string
        }
        Relationships: []
      }
      speaking_submissions: {
        Row: {
          audio_path: string | null
          audio_paths: Json | null
          audio_url: string | null
          created_at: string
          feedback: Json | null
          id: string
          prompt: string | null
          score: number | null
          topic: string | null
          user_id: string
        }
        Insert: {
          audio_path?: string | null
          audio_paths?: Json | null
          audio_url?: string | null
          created_at?: string
          feedback?: Json | null
          id?: string
          prompt?: string | null
          score?: number | null
          topic?: string | null
          user_id: string
        }
        Update: {
          audio_path?: string | null
          audio_paths?: Json | null
          audio_url?: string | null
          created_at?: string
          feedback?: Json | null
          id?: string
          prompt?: string | null
          score?: number | null
          topic?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "speaking_submissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_global"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "speaking_submissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_monthly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "speaking_submissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_weekly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "speaking_submissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "speaking_submissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_sessions: {
        Row: {
          chat_id: number
          data: Json
          message_id: number | null
          step: string
          updated_at: string
        }
        Insert: {
          chat_id: number
          data?: Json
          message_id?: number | null
          step: string
          updated_at?: string
        }
        Update: {
          chat_id?: number
          data?: Json
          message_id?: number | null
          step?: string
          updated_at?: string
        }
        Relationships: []
      }
      telegram_updates: {
        Row: {
          received_at: string
          update_id: number
        }
        Insert: {
          received_at?: string
          update_id: number
        }
        Update: {
          received_at?: string
          update_id?: number
        }
        Relationships: []
      }
      tests: {
        Row: {
          answer_key: Json | null
          created_at: string
          created_by: string | null
          difficulty: number
          file_path: string
          file_url: string
          id: string
          is_public: boolean
          kind: string
          level: string | null
          passage: number | null
          question_types: string[]
          skill: string
          slug: string | null
          tier: string
          times_done: number
          title: string
          total: number | null
          track: string
        }
        Insert: {
          answer_key?: Json | null
          created_at?: string
          created_by?: string | null
          difficulty?: number
          file_path: string
          file_url: string
          id?: string
          is_public?: boolean
          kind?: string
          level?: string | null
          passage?: number | null
          question_types?: string[]
          skill: string
          slug?: string | null
          tier?: string
          times_done?: number
          title: string
          total?: number | null
          track?: string
        }
        Update: {
          answer_key?: Json | null
          created_at?: string
          created_by?: string | null
          difficulty?: number
          file_path?: string
          file_url?: string
          id?: string
          is_public?: boolean
          kind?: string
          level?: string | null
          passage?: number | null
          question_types?: string[]
          skill?: string
          slug?: string | null
          tier?: string
          times_done?: number
          title?: string
          total?: number | null
          track?: string
        }
        Relationships: [
          {
            foreignKeyName: "tests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "leaderboard_global"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "leaderboard_monthly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "leaderboard_weekly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_achievements: {
        Row: {
          achievement_id: string
          earned_at: string
          user_id: string
        }
        Insert: {
          achievement_id: string
          earned_at?: string
          user_id: string
        }
        Update: {
          achievement_id?: string
          earned_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_achievements_achievement_id_fkey"
            columns: ["achievement_id"]
            isOneToOne: false
            referencedRelation: "achievements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_achievements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_global"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_achievements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_monthly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_achievements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_weekly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_achievements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_achievements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_reports: {
        Row: {
          avg_accuracy: number | null
          avg_band: number | null
          best_band: number | null
          created_at: string
          generated_by: string
          id: string
          new_achievements: number
          period_end: string
          period_start: string
          points: number
          rating_delta: number
          rating_end: number | null
          rating_start: number | null
          streak: number
          tests_completed: number
          user_id: string
        }
        Insert: {
          avg_accuracy?: number | null
          avg_band?: number | null
          best_band?: number | null
          created_at?: string
          generated_by?: string
          id?: string
          new_achievements?: number
          period_end: string
          period_start: string
          points?: number
          rating_delta?: number
          rating_end?: number | null
          rating_start?: number | null
          streak?: number
          tests_completed?: number
          user_id: string
        }
        Update: {
          avg_accuracy?: number | null
          avg_band?: number | null
          best_band?: number | null
          created_at?: string
          generated_by?: string
          id?: string
          new_achievements?: number
          period_end?: string
          period_start?: string
          points?: number
          rating_delta?: number
          rating_end?: number | null
          rating_start?: number | null
          streak?: number
          tests_completed?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_global"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_monthly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_weekly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      writing_submissions: {
        Row: {
          content: string | null
          created_at: string
          feedback: Json | null
          id: string
          prompt: string | null
          score: number | null
          status: string
          task_type: string
          user_id: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          feedback?: Json | null
          id?: string
          prompt?: string | null
          score?: number | null
          status?: string
          task_type: string
          user_id: string
        }
        Update: {
          content?: string | null
          created_at?: string
          feedback?: Json | null
          id?: string
          prompt?: string | null
          score?: number | null
          status?: string
          task_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "writing_submissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_global"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "writing_submissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_monthly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "writing_submissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_weekly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "writing_submissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "writing_submissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      leaderboard_global: {
        Row: {
          avatar_url: string | null
          id: string | null
          name: string | null
          peak_rating: number | null
          rank: number | null
          rated_count: number | null
          rating: number | null
          tests_completed: number | null
        }
        Relationships: []
      }
      leaderboard_monthly: {
        Row: {
          avatar_url: string | null
          id: string | null
          name: string | null
          points: number | null
          rank: number | null
          rating: number | null
          tests: number | null
        }
        Relationships: []
      }
      leaderboard_weekly: {
        Row: {
          avatar_url: string | null
          id: string | null
          name: string | null
          points: number | null
          rank: number | null
          rating: number | null
          tests: number | null
        }
        Relationships: []
      }
      profile_stats: {
        Row: {
          best_band: number | null
          first_attempt_avg_band: number | null
          id: string | null
          peak_rating: number | null
          rated_count: number | null
          rating: number | null
          reading_attempts: number | null
          total_attempts: number | null
          total_correct: number | null
          total_questions: number | null
        }
        Insert: {
          best_band?: never
          first_attempt_avg_band?: never
          id?: string | null
          peak_rating?: number | null
          rated_count?: number | null
          rating?: number | null
          reading_attempts?: never
          total_attempts?: never
          total_correct?: never
          total_questions?: never
        }
        Update: {
          best_band?: never
          first_attempt_avg_band?: never
          id?: string | null
          peak_rating?: number | null
          rated_count?: number | null
          rating?: number | null
          reading_attempts?: never
          total_attempts?: never
          total_correct?: never
          total_questions?: never
        }
        Relationships: []
      }
    }
    Functions: {
      add_discipline_strike: { Args: { target_email: string }; Returns: number }
      admin_send_weekly_report: {
        Args: { p_period_start?: string; p_user: string }
        Returns: string
      }
      apply_rating: {
        Args: { p_result_id: string }
        Returns: {
          flagged: boolean
          points: number
          rated: boolean
          rating: number
          rating_delta: number
          reason: string
        }[]
      }
      build_weekly_report: {
        Args: {
          p_generated_by?: string
          p_period_start: string
          p_user: string
        }
        Returns: string
      }
      cron_streak_reminders: {
        Args: never
        Returns: {
          email: string
          name: string
          streak: number
          user_id: string
        }[]
      }
      cron_weekly_reports: {
        Args: { p_week?: string }
        Returns: {
          avg_band: number
          best_band: number
          email: string
          emailed_period: string
          name: string
          report_id: string
          tests: number
          user_id: string
        }[]
      }
      ensure_weekly_report: { Args: never; Returns: string }
      gen_referral_code: { Args: never; Returns: string }
      gift_xp: {
        Args: { amount: number; target_email: string }
        Returns: {
          email: string
          id: string
          name: string
          xp: number
        }[]
      }
      gift_xp_as: {
        Args: { amount: number; p_actor: string; target_email: string }
        Returns: {
          email: string
          id: string
          name: string
          xp: number
        }[]
      }
      grant_achievement: {
        Args: { p_achievement: string; p_user: string }
        Returns: undefined
      }
      grant_discipline: { Args: { target_email: string }; Returns: string }
      is_admin: { Args: { uid: string }; Returns: boolean }
      is_discipline_member: { Args: { uid: string }; Returns: boolean }
      is_owner: { Args: { uid: string }; Returns: boolean }
      is_premium: { Args: { uid: string }; Returns: boolean }
      is_published_discipline_day: {
        Args: { p_day_id: string }
        Returns: boolean
      }
      public_profile: { Args: { p_id: string }; Returns: Json }
      rating_expected: {
        Args: { p_difficulty: number; p_rating: number }
        Returns: number
      }
      rating_kfactor: {
        Args: { p_rated_count: number; p_rating: number }
        Returns: number
      }
      rebuild_all_ratings: { Args: never; Returns: undefined }
      recalc_test_difficulty: {
        Args: { p_test_id: string }
        Returns: undefined
      }
      record_activity: {
        Args: { p_xp?: number }
        Returns: {
          longest_streak: number
          streak: number
          xp: number
        }[]
      }
      record_activity_for: {
        Args: { p_user_id: string; p_xp?: number }
        Returns: {
          longest_streak: number
          streak: number
          xp: number
        }[]
      }
      redeem_referral: { Args: { p_code: string }; Returns: boolean }
      referral_reward_months: { Args: never; Returns: number }
      referral_welcome_xp: { Args: never; Returns: number }
      reset_discipline: { Args: { target_email: string }; Returns: string }
      revoke_discipline: { Args: { target_email: string }; Returns: string }
      set_leaderboard_hidden: {
        Args: { hidden: boolean; target_email: string }
        Returns: {
          email: string
          hidden_from_leaderboard: boolean
          id: string
          name: string
        }[]
      }
      set_leaderboard_hidden_as: {
        Args: { hidden: boolean; p_actor: string; target_email: string }
        Returns: {
          email: string
          hidden_from_leaderboard: boolean
          id: string
          name: string
        }[]
      }
      set_premium: {
        Args: { months: number; target_email: string }
        Returns: {
          email: string
          id: string
          name: string
          premium_until: string
        }[]
      }
      set_premium_as: {
        Args: { months: number; p_actor: string; target_email: string }
        Returns: {
          email: string
          id: string
          name: string
          premium_until: string
        }[]
      }
      set_user_level: {
        Args: { new_level: string; target_email: string }
        Returns: string
      }
      set_user_level_as: {
        Args: { new_level: string; p_actor: string; target_email: string }
        Returns: string
      }
      set_user_role: {
        Args: { new_role: string; target_email: string }
        Returns: {
          email: string
          id: string
          name: string
          role: string
        }[]
      }
      slugify: { Args: { p_text: string }; Returns: string }
      unique_test_slug: {
        Args: { p_id: string; p_skill: string; p_title: string }
        Returns: string
      }
      use_ai_quota: { Args: { p_kind: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
