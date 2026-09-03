-- ============================================================
-- IELTS Platform — 0046: the Discipline challenge
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to re-run.
-- ============================================================
-- WHAT THIS ADDS
--
-- A sequential, day-by-day programme for a hand-picked set of students. It is
-- invisible to everyone else: no menu entry, the page redirects, and its tests
-- are excluded from the public catalogue and from /api/test-html.
--
-- 1. tests.track gains 'discipline' — the same mechanism the pre_ielts/intro
--    tracks already use to keep content out of /reading and /listening.
-- 2. discipline_members — MEMBERSHIP IS THE GRANT. A row here means the student
--    is in the challenge; no row means the section does not exist for them.
--    It also carries their place in the programme (current_day) and strikes.
-- 3. discipline_days / discipline_day_tests — the programme itself, one shared
--    ladder of days, each holding any number of reading/listening tests.
-- 4. discipline_completions — which student finished which day.
-- 5. Four admin-only RPCs, mirroring set_premium / set_user_level.
--
-- WHY A TABLE RATHER THAN A profiles COLUMN: the challenge needs per-student
-- state (current day, strikes, when they were reset), not just a yes/no flag,
-- and keeping it out of `profiles` means the 0023 privileged-field trigger does
-- not have to grow another column to guard.
--
-- This is ADDITIVE — it creates new objects and widens one check constraint. It
-- revokes nothing the current code reads, so unlike 0034/0041 it is safe to run
-- before the deploy.
-- ============================================================

set check_function_bodies = off;

-- 1. ------------------------------------------------ tests.track: +discipline
alter table public.tests drop constraint if exists tests_track_check;
alter table public.tests
  add constraint tests_track_check
  check (track in ('regular', 'pre_ielts', 'intro', 'discipline'));

-- 2. ------------------------------------------------------------- membership
create table if not exists public.discipline_members (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  current_day int  not null default 1,
  strikes     int  not null default 0,
  granted_by  uuid references public.profiles(id) on delete set null,
  granted_at  timestamptz not null default now(),
  reset_at    timestamptz
);

-- 3. --------------------------------------------------------- the programme
create table if not exists public.discipline_days (
  id           uuid primary key default gen_random_uuid(),
  day_number   int not null unique,
  title        text,
  instructions text,
  created_at   timestamptz not null default now()
);

create table if not exists public.discipline_day_tests (
  day_id   uuid not null references public.discipline_days(id) on delete cascade,
  test_id  uuid not null references public.tests(id) on delete cascade,
  position int  not null default 0,
  primary key (day_id, test_id)
);

-- 4. --------------------------------------------------------------- progress
create table if not exists public.discipline_completions (
  user_id      uuid not null references public.profiles(id) on delete cascade,
  day_id       uuid not null references public.discipline_days(id) on delete cascade,
  result_id    uuid references public.results(id) on delete set null,
  completed_at timestamptz not null default now(),
  primary key (user_id, day_id)
);

create index if not exists discipline_day_tests_day_idx on public.discipline_day_tests (day_id);
create index if not exists discipline_completions_user_idx on public.discipline_completions (user_id);

-- 5. -------------------------------------------------------- membership test
-- Used by the RLS policies below and by the app's requireDiscipline() gate.
create or replace function public.is_discipline_member(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from discipline_members m where m.user_id = uid);
$$;

revoke all on function public.is_discipline_member(uuid) from public, anon;
grant execute on function public.is_discipline_member(uuid) to authenticated, service_role;

-- 6. ----------------------------------------------------------------- RLS
alter table public.discipline_members     enable row level security;
alter table public.discipline_days        enable row level security;
alter table public.discipline_day_tests   enable row level security;
alter table public.discipline_completions enable row level security;

drop policy if exists discipline_members_select on public.discipline_members;
create policy discipline_members_select on public.discipline_members
  for select using (user_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists discipline_days_select on public.discipline_days;
create policy discipline_days_select on public.discipline_days
  for select using (public.is_discipline_member(auth.uid()) or public.is_admin(auth.uid()));

drop policy if exists discipline_day_tests_select on public.discipline_day_tests;
create policy discipline_day_tests_select on public.discipline_day_tests
  for select using (public.is_discipline_member(auth.uid()) or public.is_admin(auth.uid()));

drop policy if exists discipline_completions_select on public.discipline_completions;
create policy discipline_completions_select on public.discipline_completions
  for select using (user_id = auth.uid() or public.is_admin(auth.uid()));

-- A completion advances the student through the programme, so it is a scored
-- record in the sense CLAUDE.md means: written by the server, from a verified
-- session, never by the browser. Same rule as `results` (0038) and speaking /
-- writing submissions (0041). No client role gets a write grant.
revoke insert, update, delete on public.discipline_members     from anon, authenticated;
revoke insert, update, delete on public.discipline_days        from anon, authenticated;
revoke insert, update, delete on public.discipline_day_tests   from anon, authenticated;
revoke insert, update, delete on public.discipline_completions from anon, authenticated;

grant select on public.discipline_members     to authenticated;
grant select on public.discipline_days        to authenticated;
grant select on public.discipline_day_tests   to authenticated;
grant select on public.discipline_completions to authenticated;

-- 7. -------------------------------------------------------- admin-only RPCs
-- Shaped exactly like set_premium / set_user_level: SECURITY DEFINER, keyed on
-- the student's email, and refusing anyone whose profile is not an admin.
--
-- NOTE for the Telegram bot: auth.uid() is NULL under the service role, so
-- these raise if called with it — the same trap 0040 documents. A bot command
-- would need a `_for` variant taking the caller id explicitly.

create or replace function public.grant_discipline(target_email text)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  caller_role text;
  target_id   uuid;
begin
  select role into caller_role from profiles where id = auth.uid();
  if caller_role is distinct from 'admin' then
    raise exception 'Only admins may grant Discipline access.' using errcode = '42501';
  end if;

  select id into target_id from profiles where lower(email) = lower(trim(target_email));
  if target_id is null then
    raise exception 'No user found with that email.' using errcode = 'no_data_found';
  end if;

  insert into discipline_members (user_id, granted_by)
  values (target_id, auth.uid())
  on conflict (user_id) do nothing;

  return target_email;
end;
$fn$;

create or replace function public.revoke_discipline(target_email text)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  caller_role text;
  target_id   uuid;
begin
  select role into caller_role from profiles where id = auth.uid();
  if caller_role is distinct from 'admin' then
    raise exception 'Only admins may revoke Discipline access.' using errcode = '42501';
  end if;

  select id into target_id from profiles where lower(email) = lower(trim(target_email));
  if target_id is null then
    raise exception 'No user found with that email.' using errcode = 'no_data_found';
  end if;

  -- Their completions are kept. Re-granting later restores the history rather
  -- than silently starting them over; reset_discipline() is the way to do that
  -- deliberately.
  delete from discipline_members where user_id = target_id;
  return target_email;
end;
$fn$;

create or replace function public.add_discipline_strike(target_email text)
returns int
language plpgsql
security definer
set search_path = public
as $fn$
declare
  caller_role text;
  target_id   uuid;
  new_strikes int;
begin
  select role into caller_role from profiles where id = auth.uid();
  if caller_role is distinct from 'admin' then
    raise exception 'Only admins may record a strike.' using errcode = '42501';
  end if;

  select id into target_id from profiles where lower(email) = lower(trim(target_email));
  if target_id is null then
    raise exception 'No user found with that email.' using errcode = 'no_data_found';
  end if;

  update discipline_members
     set strikes = strikes + 1
   where user_id = target_id
   returning strikes into new_strikes;

  if new_strikes is null then
    raise exception 'That student is not in the Discipline challenge.' using errcode = 'no_data_found';
  end if;

  return new_strikes;
end;
$fn$;

-- Back to Day 1, strikes cleared, completions wiped. Access is KEPT: three
-- strikes costs the student their progress, not their place.
create or replace function public.reset_discipline(target_email text)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  caller_role text;
  target_id   uuid;
begin
  select role into caller_role from profiles where id = auth.uid();
  if caller_role is distinct from 'admin' then
    raise exception 'Only admins may reset a student.' using errcode = '42501';
  end if;

  select id into target_id from profiles where lower(email) = lower(trim(target_email));
  if target_id is null then
    raise exception 'No user found with that email.' using errcode = 'no_data_found';
  end if;

  delete from discipline_completions where user_id = target_id;

  update discipline_members
     set current_day = 1, strikes = 0, reset_at = now()
   where user_id = target_id;

  return target_email;
end;
$fn$;

revoke all on function public.grant_discipline(text)      from public, anon;
revoke all on function public.revoke_discipline(text)     from public, anon;
revoke all on function public.add_discipline_strike(text) from public, anon;
revoke all on function public.reset_discipline(text)      from public, anon;
grant execute on function public.grant_discipline(text)      to authenticated;
grant execute on function public.revoke_discipline(text)     to authenticated;
grant execute on function public.add_discipline_strike(text) to authenticated;
grant execute on function public.reset_discipline(text)      to authenticated;

-- ============================================================
-- VERIFY (optional):
--   select count(*) from public.discipline_members;
--   select track, count(*) from public.tests group by track;
--   -- as a NON-admin this must fail:
--   select public.grant_discipline('someone@example.com');
--   -- as a non-member this must return no rows:
--   select * from public.discipline_days;
--
-- ROLLBACK:
--   drop function if exists public.grant_discipline(text), public.revoke_discipline(text),
--     public.add_discipline_strike(text), public.reset_discipline(text),
--     public.is_discipline_member(uuid);
--   drop table if exists public.discipline_completions, public.discipline_day_tests,
--     public.discipline_days, public.discipline_members;
--   alter table public.tests drop constraint if exists tests_track_check;
--   alter table public.tests add constraint tests_track_check
--     check (track in ('regular','pre_ielts','intro'));
-- ============================================================
