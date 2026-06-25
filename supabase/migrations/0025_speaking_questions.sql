-- ============================================================
-- IELTS Platform — 0025: Speaking question bank (from Telegram bot)
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to re-run.
-- ============================================================
-- A browsable bank of IELTS Speaking questions, grouped by Part (1/2/3).
-- Rows are inserted automatically by the Telegram bot when a post is approved,
-- and backfilled from the existing channel posts. Read-only for logged-in users.

create table if not exists public.speaking_questions (
  id                  uuid primary key default gen_random_uuid(),
  part                int  not null check (part in (1, 2, 3)),
  title               text not null default '',
  number              text,                 -- e.g. "Question 4" (display badge)
  content             text not null default '',  -- the questions / cue card text
  channel_message_id  bigint unique,        -- de-dupes inserts + backfill re-runs
  channel_link        text,                 -- t.me link to the source post
  created_at          timestamptz not null default now()
);

create index if not exists speaking_questions_part_idx
  on public.speaking_questions(part, created_at);

-- RLS: any logged-in user may read; writes happen only via the service-role key
-- (the bot / backfill), which bypasses RLS — so no insert/update policy is needed.
alter table public.speaking_questions enable row level security;

drop policy if exists "speaking_questions_read" on public.speaking_questions;
create policy "speaking_questions_read"
  on public.speaking_questions
  for select
  to authenticated
  using (true);
-- ============================================================
