-- ============================================================
-- IELTS Platform — 0052: mock exam integrity (server clocks, drafts, report)
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to re-run. ADDITIVE — safe before the deploy.
-- ============================================================
-- From the 2026-09-15 anti-cheating meeting (Codex, Grok, agy + owner):
--
-- 1. SERVER CLOCKS FOR LISTENING AND READING. Only Writing had one. A reload of
--    a Listening section reloaded the CDI file, which restarted its own timer
--    and REPLAYED the audio from 0. Now each section is stamped once when it is
--    first opened and has a server deadline (minutes snapshotted at grant, like
--    writing_minutes in 0051).
-- 2. DRAFTS. The runner snapshots the student's answers every ~15 s, so a reload
--    restores them and a deadline can be finalised from what was saved.
--    listening_audio_pos is the furthest point the audio reached — a reload
--    resumes there instead of replaying.
-- 3. INTEGRITY. Counters + a capped event list (fullscreen exits, hidden time,
--    reloads, second tab, pastes, device). Evidence for the TEACHER; nothing is
--    ever decided automatically from it.
--
-- As with 0050, anon/authenticated have no grants on these tables; every read
-- and write goes through the service-role libraries.
-- ============================================================

alter table public.mocks
  add column if not exists listening_minutes int not null default 40,
  add column if not exists reading_minutes   int not null default 60;

alter table public.mocks drop constraint if exists mocks_listening_minutes_check;
alter table public.mocks add constraint mocks_listening_minutes_check check (listening_minutes between 10 and 180);
alter table public.mocks drop constraint if exists mocks_reading_minutes_check;
alter table public.mocks add constraint mocks_reading_minutes_check check (reading_minutes between 10 and 180);

alter table public.mock_attempts
  add column if not exists listening_started_at timestamptz,
  add column if not exists reading_started_at   timestamptz,
  add column if not exists listening_minutes    int,
  add column if not exists reading_minutes      int,
  add column if not exists listening_draft      jsonb,
  add column if not exists reading_draft        jsonb,
  add column if not exists listening_audio_pos  numeric,
  add column if not exists integrity            jsonb not null default '{}'::jsonb;

-- ============================================================
-- ROLLBACK:
--   alter table public.mock_attempts drop column if exists listening_started_at,
--     drop column if exists reading_started_at, drop column if exists listening_minutes,
--     drop column if exists reading_minutes, drop column if exists listening_draft,
--     drop column if exists reading_draft, drop column if exists listening_audio_pos,
--     drop column if exists integrity;
--   alter table public.mocks drop column if exists listening_minutes,
--     drop column if exists reading_minutes;
-- ============================================================
