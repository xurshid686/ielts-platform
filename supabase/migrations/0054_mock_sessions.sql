-- ============================================================
-- IELTS Platform — 0054: mock sessions, instruction videos, paper profiles
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to re-run. ADDITIVE — safe before the deploy.
-- ============================================================
-- WHAT THIS ADDS (owner's decisions of 2026-09-15)
--
-- 1. mocks.session_state  waiting | running | closed.
--    An approved place is not enough to start: the owner clicks Start session,
--    which admits every approved student (late starters too) until End session.
--    Ending admits nobody new; students already inside finish normally.
--    Existing mocks are backfilled to 'closed' ONCE (the owner's "Mock 1" trial
--    keeps its data but can't be started again). The backfill runs only in the
--    same statement that creates the column, so re-running never closes a mock.
--
-- 2. mock_attempts.<section>_video_*  the instruction video before each section.
--    The section clock no longer starts when the page opens: it starts at the
--    "Start <section>" click, which the server refuses until the video is done.
--    video_pos lets a reload resume the video where it was; video_started_at is
--    the server's own stopwatch for the "watched it, didn't skip it" check.
--
-- 3. mock_videos  the three instruction videos, shared by every mock.
--
-- 4. tests.mock_profile / mock_selftest / default_minutes  the upload-time
--    parsing report for a mock paper, the result of the live self-test the
--    admin's browser runs, and the minutes suggested for the section. A paper
--    only goes into a running session with a passing self-test for its CURRENT
--    file hash.
--
-- Same grant rule as 0050: no client role reads mock_videos; the server reads
-- it with the service role.
-- ============================================================

set check_function_bodies = off;

-- 1. ----------------------------------------------------------- session state
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'mocks' and column_name = 'session_state'
  ) then
    alter table public.mocks add column session_state text not null default 'waiting';
    -- One-time backfill: every mock that exists before sessions is a finished sitting.
    update public.mocks set session_state = 'closed';
  end if;
end $$;

alter table public.mocks drop constraint if exists mocks_session_state_check;
alter table public.mocks
  add constraint mocks_session_state_check check (session_state in ('waiting', 'running', 'closed'));

alter table public.mocks
  add column if not exists session_started_at timestamptz,
  add column if not exists session_started_by uuid references public.profiles(id) on delete set null,
  add column if not exists session_closed_at  timestamptz,
  add column if not exists session_closed_by  uuid references public.profiles(id) on delete set null;

update public.mocks
  set session_closed_at = coalesce(session_closed_at, updated_at)
  where session_state = 'closed' and session_closed_at is null;

-- 2. ------------------------------------------------ per-section video progress
alter table public.mock_attempts
  add column if not exists listening_video_pos        numeric(7,1),
  add column if not exists listening_video_started_at timestamptz,
  add column if not exists listening_video_done_at    timestamptz,
  add column if not exists reading_video_pos          numeric(7,1),
  add column if not exists reading_video_started_at   timestamptz,
  add column if not exists reading_video_done_at      timestamptz,
  add column if not exists writing_video_pos          numeric(7,1),
  add column if not exists writing_video_started_at   timestamptz,
  add column if not exists writing_video_done_at      timestamptz;

-- 3. --------------------------------------------------------- instruction videos
create table if not exists public.mock_videos (
  section     text primary key check (section in ('listening', 'reading', 'writing')),
  url         text not null,
  duration_s  numeric(7,2) not null check (duration_s > 0 and duration_s < 3600),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles(id) on delete set null
);

alter table public.mock_videos enable row level security;
revoke all on public.mock_videos from anon, authenticated;

-- 4. ------------------------------------------------------- paper parse reports
alter table public.tests
  add column if not exists mock_profile    jsonb,
  add column if not exists mock_selftest   jsonb,
  add column if not exists default_minutes int;

alter table public.tests drop constraint if exists tests_default_minutes_check;
alter table public.tests
  add constraint tests_default_minutes_check check (default_minutes is null or default_minutes between 10 and 180);

-- ROLLBACK:
--   alter table public.tests drop column if exists mock_profile, drop column if exists mock_selftest,
--     drop column if exists default_minutes;
--   drop table if exists public.mock_videos;
--   alter table public.mock_attempts drop column if exists listening_video_pos, ... (all nine *_video_* columns);
--   alter table public.mocks drop column if exists session_state, drop column if exists session_started_at,
--     drop column if exists session_started_by, drop column if exists session_closed_at,
--     drop column if exists session_closed_by;
