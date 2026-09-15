-- ============================================================
-- IELTS Platform — 0050: the Mock exam section
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to re-run.
-- ============================================================
-- WHAT THIS ADDS
--
-- A full mock exam — Listening, then Reading, then Writing — that a student
-- sits ONCE, only after the owner has approved their request, and whose result
-- stays hidden from them until the owner RELEASES it.
--
-- 1. tests.track gains 'mock'. Every public surface (catalogue, sitemap,
--    RelatedTests, /review, /api/guest-grade) keeps only track = 'regular', so
--    mock papers are excluded from all of them by construction.
-- 2. mocks          — a mock definition: one listening paper, one reading paper,
--                     the two writing prompts, and a published flag.
-- 3. mock_requests  — a student asks to sit a mock; the owner approves/rejects.
-- 4. mock_attempts  — THE PERMANENT RECORD. Created on approval, it holds every
--                     answer, both essays, every band and the release stamp.
-- 5. storage bucket `mock-assets` (private) for Writing Task 1 images.
--
-- WHY THE SCORES DO NOT GO INTO `results`
--
-- `results_select_owner_or_admin` lets a student read their own results rows
-- straight through PostgREST. A mock band written there would be readable by
-- the student the moment they submitted — before release — no matter what the
-- UI hides. It would also feed the dashboard, leaderboard, rating, weekly
-- report and times_done. So mock scores live ONLY in mock_attempts.
--
-- WHY NO CLIENT ROLE CAN READ THESE TABLES AT ALL
--
-- Column-level hiding under RLS is fragile (one `select("*")` leaks a band).
-- Instead anon/authenticated get NO grants on the three tables: every read and
-- write goes through the server-only library src/lib/mock.ts with the service
-- role, which is the one place that decides what a student may see (scores
-- only once status = 'released'). Same reasoning 0049 used for its library:
-- plain TypeScript gated by its callers also lets the Telegram bot approve a
-- request, which an is_admin(auth.uid()) RPC cannot (auth.uid() is NULL under
-- the service role — see 0040).
--
-- WHY RECORDS SURVIVE ACCOUNT DELETION
--
-- mock_attempts.user_id is `on delete set null`, not cascade, and the student's
-- name and email are snapshotted onto the row. The owner asked for mock results
-- to be kept for good; a deleted account must not take its exam record with it.
-- mocks referenced by an attempt cannot be deleted (`on delete restrict`).
--
-- This is ADDITIVE — new objects plus one widened check constraint. It revokes
-- nothing the current code reads, so it is safe to run before the deploy.
-- ============================================================

set check_function_bodies = off;

-- 1. ------------------------------------------------------ tests.track: +mock
alter table public.tests drop constraint if exists tests_track_check;
alter table public.tests
  add constraint tests_track_check
  check (track in ('regular', 'pre_ielts', 'intro', 'discipline', 'mock'));

-- 2. ------------------------------------------------------------------ mocks
create table if not exists public.mocks (
  id                       uuid primary key default gen_random_uuid(),
  title                    text not null,
  description              text,
  listening_test_id        uuid references public.tests(id) on delete set null,
  reading_test_id          uuid references public.tests(id) on delete set null,
  writing_task1_prompt     text,
  writing_task1_image_path text,
  writing_task2_prompt     text,
  writing_minutes          int  not null default 60 check (writing_minutes between 10 and 180),
  published                boolean not null default false,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- 3. -------------------------------------------------------------- requests
create table if not exists public.mock_requests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  mock_id      uuid not null references public.mocks(id) on delete cascade,
  status       text not null default 'pending'
               check (status in ('pending', 'approved', 'rejected')),
  message      text,
  created_at   timestamptz not null default now(),
  decided_at   timestamptz,
  decided_by   uuid references public.profiles(id) on delete set null
);

-- At most one live request per student per mock.
create unique index if not exists mock_requests_one_pending
  on public.mock_requests (user_id, mock_id)
  where status = 'pending';

create index if not exists mock_requests_pending_idx
  on public.mock_requests (created_at desc)
  where status = 'pending';

-- 4. -------------------------------------------------------------- attempts
create table if not exists public.mock_attempts (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid references public.profiles(id) on delete set null,
  student_name            text,
  student_email           text,
  mock_id                 uuid not null references public.mocks(id) on delete restrict,
  request_id              uuid references public.mock_requests(id) on delete set null,

  status                  text not null default 'approved'
                          check (status in ('approved', 'in_progress', 'submitted', 'released')),

  approved_at             timestamptz not null default now(),
  approved_by             uuid references public.profiles(id) on delete set null,
  started_at              timestamptz,

  -- Which papers this attempt was sat on. Copied from the mock at approval so
  -- that editing the mock later cannot re-point a finished attempt.
  listening_test_id       uuid references public.tests(id) on delete set null,
  reading_test_id         uuid references public.tests(id) on delete set null,

  listening_answers       jsonb,
  listening_raw           int,
  listening_total         int,
  listening_band          numeric(3,1),
  listening_submitted_at  timestamptz,

  reading_answers         jsonb,
  reading_raw             int,
  reading_total           int,
  reading_band            numeric(3,1),
  reading_submitted_at    timestamptz,

  -- Prompts copied at start for the same reason as the test ids.
  writing_task1_prompt    text,
  writing_task2_prompt    text,
  writing_task1           text,
  writing_task2           text,
  writing_started_at      timestamptz,
  writing_saved_at        timestamptz,
  writing_submitted_at    timestamptz,

  writing_task1_band      numeric(3,1),
  writing_task2_band      numeric(3,1),
  writing_band            numeric(3,1),
  writing_feedback        text,
  graded_at               timestamptz,
  graded_by               uuid references public.profiles(id) on delete set null,

  overall_band            numeric(3,1),
  submitted_at            timestamptz,
  released_at             timestamptz,
  released_by             uuid references public.profiles(id) on delete set null,

  created_at              timestamptz not null default now()
);

-- One attempt per student per mock: approval is for a single sitting.
create unique index if not exists mock_attempts_one_per_student
  on public.mock_attempts (user_id, mock_id)
  where user_id is not null;

create index if not exists mock_attempts_mock_idx   on public.mock_attempts (mock_id, created_at desc);
create index if not exists mock_attempts_status_idx on public.mock_attempts (status, submitted_at desc);

-- 5. ------------------------------------------------------------------- RLS
-- Enabled with NO policies and NO grants for the client roles: a direct
-- PostgREST read or write by a student returns nothing / permission denied.
-- The service role bypasses RLS; src/lib/mock.ts is the only door.
alter table public.mocks         enable row level security;
alter table public.mock_requests enable row level security;
alter table public.mock_attempts enable row level security;

revoke all on public.mocks         from anon, authenticated;
revoke all on public.mock_requests from anon, authenticated;
revoke all on public.mock_attempts from anon, authenticated;

grant all on public.mocks         to service_role;
grant all on public.mock_requests to service_role;
grant all on public.mock_attempts to service_role;

-- 6. ----------------------------------------------------- Task 1 image bucket
insert into storage.buckets (id, name, public)
values ('mock-assets', 'mock-assets', false)
on conflict (id) do nothing;

-- ============================================================
-- VERIFY (optional):
--   select track, count(*) from public.tests group by track;
--   -- as a signed-in student (PostgREST) these must be denied / empty:
--   select * from public.mock_attempts;
--   select * from public.mocks;
--
-- ROLLBACK (only while no attempt exists — they are the permanent record):
--   drop table if exists public.mock_attempts, public.mock_requests, public.mocks;
--   delete from storage.buckets where id = 'mock-assets';  -- after emptying it
--   alter table public.tests drop constraint if exists tests_track_check;
--   alter table public.tests add constraint tests_track_check
--     check (track in ('regular','pre_ielts','intro','discipline'));
--   -- (only after moving any mock-track tests to another track)
-- ============================================================
