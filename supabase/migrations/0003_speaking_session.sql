-- ============================================================
-- IELTS Platform — 0003: Speaking sessions (Phase 2)
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to re-run.
-- ============================================================
-- A full 3-part Speaking mock records one audio file per part, so a session
-- needs to hold several audio paths. We keep the existing single audio_path/
-- audio_url columns (nullable) and add an array for the per-part files.
--   feedback jsonb already exists -> holds the Gemini band breakdown + transcript
--   score    numeric already exists -> overall band

alter table public.speaking_submissions
  add column if not exists audio_paths jsonb,  -- ["<uid>/<session>/part1.wav", ...]
  add column if not exists topic       text;   -- the prompt set title

create index if not exists speaking_user_idx
  on public.speaking_submissions(user_id, created_at desc);

-- RLS + owner policies were created in 0001. The 'speaking' storage bucket is
-- private and owner-scoped (path must start with the user's id) — unchanged.
-- ============================================================
