-- ============================================================
-- IELTS Platform — 0049: the Cambridge section
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to re-run.
-- ============================================================
-- WHAT THIS ADDS
--
-- A library of Cambridge reading/listening papers that only hand-approved
-- students may open. Cambridge material is copyrighted, so unlike /reading and
-- /listening it is never served to the public.
--
-- It is the Discipline shape (0046) — MEMBERSHIP IS THE GRANT — with two
-- deliberate differences:
--
--   1. The section is VISIBLE to everyone. /cambridge renders a locked, blurred
--      teaser for a non-member instead of pretending not to exist. That is the
--      whole point: a student has to be able to see there is something to ask
--      for. (Discipline hides itself; nobody is meant to request a place there.)
--   2. There is a REQUEST QUEUE. A student asks, the owner approves in the
--      admin panel or from the Telegram bot, and the grant is section-wide and
--      permanent until revoked by hand.
--
-- 1. tests.track gains 'cambridge' — the same audience-gating mechanism the
--    pre_ielts / intro / discipline tracks already use. Every public surface
--    (the catalogue, the sitemap, RelatedTests, TestIndexLinks, the review page
--    and /api/guest-grade) already keeps only track = 'regular', so the papers
--    are excluded from all of them by construction, with no new filters.
-- 2. cambridge_members — the grant. A row means the student is in.
-- 3. cambridge_requests — one row per student, re-requestable after a refusal.
--
-- NOTE: there are no admin RPCs here, and that is deliberate. grant_discipline
-- and friends re-check is_admin(auth.uid()), which is NULL under the service
-- role — the documented trap that stops the Telegram bot calling them (see
-- 0040 and CLAUDE.md). Cambridge writes go through ONE server-only library,
-- src/lib/cambridge.ts, gated by its callers (assertAdmin() in the server
-- actions, the webhook's owner check in the bot), exactly like
-- createTestFromHtml(). That is what lets the owner approve from their phone
-- with the same code path the web UI uses.
--
-- This is ADDITIVE — new objects plus one widened check constraint. It revokes
-- nothing the current code reads, so unlike 0034/0041 it is safe to run before
-- the deploy.
-- ============================================================

set check_function_bodies = off;

-- 1. ------------------------------------------------- tests.track: +cambridge
alter table public.tests drop constraint if exists tests_track_check;
alter table public.tests
  add constraint tests_track_check
  check (track in ('regular', 'pre_ielts', 'intro', 'discipline', 'cambridge'));

-- 2. ------------------------------------------------------------- membership
create table if not exists public.cambridge_members (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  granted_by uuid references public.profiles(id) on delete set null,
  granted_at timestamptz not null default now()
);

-- 3. ---------------------------------------------------------- the requests
-- Keyed on user_id rather than a surrogate id: a student has at most one live
-- request, and a re-request after a refusal updates the row in place. That
-- makes "already pending" a primary-key fact rather than something the
-- application has to police with a count.
create table if not exists public.cambridge_requests (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  status     text not null default 'pending'
             check (status in ('pending', 'approved', 'rejected')),
  message    text,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles(id) on delete set null
);

create index if not exists cambridge_requests_pending_idx
  on public.cambridge_requests (created_at desc)
  where status = 'pending';

-- 4. -------------------------------------------------------- membership test
-- Mirrors is_discipline_member(uuid). Used by the RLS policies below.
create or replace function public.is_cambridge_member(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from cambridge_members m where m.user_id = uid);
$$;

revoke all on function public.is_cambridge_member(uuid) from public, anon;
grant execute on function public.is_cambridge_member(uuid) to authenticated, service_role;

-- 5. ------------------------------------------------------------------- RLS
alter table public.cambridge_members  enable row level security;
alter table public.cambridge_requests enable row level security;

drop policy if exists cambridge_members_select on public.cambridge_members;
create policy cambridge_members_select on public.cambridge_members
  for select using (user_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists cambridge_requests_select on public.cambridge_requests;
create policy cambridge_requests_select on public.cambridge_requests
  for select using (user_id = auth.uid() or public.is_admin(auth.uid()));

-- A request is an admin-facing record and a membership row is an entitlement,
-- so both are written by the server from a verified session — the same rule as
-- `results` (0038), the speaking/writing submissions (0041) and every
-- discipline table (0046). No client role gets a write grant.
--
-- Revoking INSERT on cambridge_requests is not paranoia about a student asking
-- twice: it is what lets the server stamp user_id from the session rather than
-- from the request body, and cap the message length in one place.
revoke insert, update, delete on public.cambridge_members  from anon, authenticated;
revoke insert, update, delete on public.cambridge_requests from anon, authenticated;

grant select on public.cambridge_members  to authenticated;
grant select on public.cambridge_requests to authenticated;

-- ============================================================
-- VERIFY (optional):
--   select count(*) from public.cambridge_members;
--   select track, count(*) from public.tests group by track;
--   -- as a signed-in NON-member these must return no rows:
--   select * from public.cambridge_members;
--   select * from public.cambridge_requests;
--   -- and this must fail with "permission denied":
--   insert into public.cambridge_requests (user_id) values (auth.uid());
--
-- ROLLBACK:
--   drop function if exists public.is_cambridge_member(uuid);
--   drop table if exists public.cambridge_requests, public.cambridge_members;
--   alter table public.tests drop constraint if exists tests_track_check;
--   alter table public.tests add constraint tests_track_check
--     check (track in ('regular','pre_ielts','intro','discipline'));
--   -- (only after moving any cambridge-track tests to another track)
-- ============================================================
