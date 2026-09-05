-- ============================================================
-- IELTS Platform — 0047: Discipline days are drafts until published
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to re-run.
-- ============================================================
-- WHAT THIS ADDS
--
-- A day built in the admin Programme tab used to be visible to its students the
-- instant it was created — there was no way to load next week's papers in
-- advance. This adds one flag:
--
--   discipline_days.published  false = draft, invisible to students
--                              true  = live
--
-- BACKFILL, AND WHY IT IS DONE WITH A DEFAULT RATHER THAN AN UPDATE:
-- the column is added with `default true` and the default is THEN lowered to
-- false. Rows that already exist are already live for students, and flipping
-- them to draft would pull the programme out from under anyone mid-challenge;
-- rows created after this migration are drafts. Doing it in that order means the
-- backfill is part of the ADD COLUMN, so a re-run (where the column already
-- exists) cannot re-publish a day the owner has since unpublished.
--
-- RLS: a member may read only PUBLISHED days, and only the test links hanging
-- off them. The app filters as well, but the database is the thing that decides
-- — same rule as 0046, where membership is the grant.
--
-- ADDITIVE. Revokes nothing the current code reads; safe to run before deploy.
-- ============================================================

set check_function_bodies = off;

-- 1. ------------------------------------------------------------- the flag
alter table public.discipline_days
  add column if not exists published boolean not null default true;
alter table public.discipline_days
  alter column published set default false;

alter table public.discipline_days
  add column if not exists published_at timestamptz;

update public.discipline_days
   set published_at = coalesce(published_at, created_at)
 where published and published_at is null;

create index if not exists discipline_days_published_idx
  on public.discipline_days (published, day_number);

-- 2. -------------------------------------------------------- published test
-- Used by the RLS policy on discipline_day_tests and by the test-access gate,
-- so "is this paper reachable yet" has ONE definition.
create or replace function public.is_published_discipline_day(p_day_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from discipline_days d where d.id = p_day_id and d.published
  );
$$;

revoke all on function public.is_published_discipline_day(uuid) from public, anon;
grant execute on function public.is_published_discipline_day(uuid) to authenticated, service_role;

-- 3. ------------------------------------------------------------------ RLS
-- Admins keep the unfiltered view: the Programme tab has to show drafts, and
-- the admin preview of /discipline shows them flagged as drafts.
drop policy if exists discipline_days_select on public.discipline_days;
create policy discipline_days_select on public.discipline_days
  for select using (
    (public.is_discipline_member(auth.uid()) and published)
    or public.is_admin(auth.uid())
  );

drop policy if exists discipline_day_tests_select on public.discipline_day_tests;
create policy discipline_day_tests_select on public.discipline_day_tests
  for select using (
    (public.is_discipline_member(auth.uid())
      and public.is_published_discipline_day(day_id))
    or public.is_admin(auth.uid())
  );

-- ============================================================
-- VERIFY (optional):
--   select day_number, published, published_at from public.discipline_days
--    order by day_number;
--   -- every pre-existing day must read published = true
--
--   -- as a MEMBER (not an admin), a draft day must not come back:
--   select day_number from public.discipline_days order by day_number;
--
-- ROLLBACK:
--   drop policy if exists discipline_day_tests_select on public.discipline_day_tests;
--   create policy discipline_day_tests_select on public.discipline_day_tests
--     for select using (public.is_discipline_member(auth.uid()) or public.is_admin(auth.uid()));
--   drop policy if exists discipline_days_select on public.discipline_days;
--   create policy discipline_days_select on public.discipline_days
--     for select using (public.is_discipline_member(auth.uid()) or public.is_admin(auth.uid()));
--   drop function if exists public.is_published_discipline_day(uuid);
--   drop index if exists public.discipline_days_published_idx;
--   alter table public.discipline_days drop column if exists published_at;
--   alter table public.discipline_days drop column if exists published;
-- ============================================================
