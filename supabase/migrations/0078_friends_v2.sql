-- 0078: Friends v2 (owner, 2026-11-27). Personal invitations that hold a seat
-- for 7 days, group names, leave and remove-inactive, a weekly group goal
-- (+100 XP each), nudges, a group leaderboard, admin hide and change-buyer, and
-- the public profile gaining streak and weekly points.
--
-- ADDITIVE: new tables and columns, new functions, and friends_join /
-- public_profile re-created as supersets. The running code (0077) keeps working.
-- Verify with scripts/check-0078.mjs.
--
-- Rules:
--   * seats used = members + pending invitations that haven't expired;
--   * a member who leaves or is removed gets back the Premium date they had
--     before joining, unless it changed since (e.g. they bought Premium);
--   * the buyer can remove only a member with no results since joining;
--   * the goal counts distinct (member, test) results since Monday 00:00 UTC
--     (the same week as leaderboard_weekly) and needs 2 or more members.

-- ------------------------------------------------------------------ columns
alter table public.premium_groups
  add column if not exists name text check (name is null or char_length(name) between 2 and 30),
  add column if not exists name_changed_at timestamptz,
  add column if not exists hidden_from_leaderboard boolean not null default false;

alter table public.premium_group_members
  add column if not exists premium_before timestamptz;

alter table public.profiles
  add column if not exists friends_mute_nudges boolean not null default false,
  add column if not exists friends_hide_bands boolean not null default false;

-- ------------------------------------------------------------------ tables
create table if not exists public.premium_group_invites (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.premium_groups(id) on delete cascade,
  invitee_id   uuid not null references public.profiles(id) on delete cascade,
  invited_by   uuid references public.profiles(id) on delete set null,
  status       text not null default 'pending'
               check (status in ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '7 days',
  responded_at timestamptz
);
create unique index if not exists premium_group_invites_one_pending
  on public.premium_group_invites (group_id, invitee_id) where status = 'pending';
create index if not exists premium_group_invites_invitee
  on public.premium_group_invites (invitee_id) where status = 'pending';

create table if not exists public.premium_group_goal_weeks (
  group_id   uuid not null references public.premium_groups(id) on delete cascade,
  week_start date not null,
  target     int not null,
  reached_at timestamptz not null default now(),
  primary key (group_id, week_start)
);

create table if not exists public.friends_nudges (
  from_id uuid not null references public.profiles(id) on delete cascade,
  to_id   uuid not null references public.profiles(id) on delete cascade,
  day     date not null,
  primary key (from_id, to_id, day)
);

alter table public.premium_group_invites enable row level security;
alter table public.premium_group_goal_weeks enable row level security;
alter table public.friends_nudges enable row level security;
revoke all on public.premium_group_invites from anon, authenticated;
revoke all on public.premium_group_goal_weeks from anon, authenticated;
revoke all on public.friends_nudges from anon, authenticated;

-- ------------------------------------------------------------------ helpers
create or replace function public.friends_week_start()
returns timestamptz
language sql
stable
as $fn$ select date_trunc('week', (now() at time zone 'utc')) at time zone 'utc' $fn$;

-- "Aziz's group" when no name is set.
create or replace function public.friends_group_name(p_group uuid)
returns text
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(
    g.name,
    coalesce(nullif(split_part(trim(coalesce(p.name, '')), ' ', 1), ''), 'Friends') || '''s group'
  )
  from public.premium_groups g
  left join public.profiles p on p.id = g.owner_id
  where g.id = p_group
$fn$;

create or replace function public.friends_seats_used(p_group uuid, p_except_invitee uuid default null)
returns int
language sql
stable
security definer
set search_path = public
as $fn$
  select (select count(*) from public.premium_group_members where group_id = p_group)::int
       + (select count(*) from public.premium_group_invites
           where group_id = p_group and status = 'pending' and expires_at > now()
             and (p_except_invitee is null or invitee_id <> p_except_invitee))::int
$fn$;

-- Put back the Premium date a member had before joining, unless it moved since.
create or replace function public.friends_restore_premium(p_group uuid, p_user uuid, p_before timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  g_end timestamptz;
begin
  select expires_at into g_end from public.premium_groups where id = p_group;
  update public.profiles
     set premium_until = case when p_before is null or p_before < now() then now() else p_before end
   where id = p_user
     and premium_until is not null
     and premium_until = g_end;   -- still exactly the group's date: nothing else extended it
end;
$fn$;

-- Shared by the link join and an accepted invitation (caller holds the group lock).
create or replace function public.friends_add_member(p_group uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  g_end timestamptz;
  before timestamptz;
begin
  select expires_at into g_end from public.premium_groups where id = p_group;
  select premium_until into before from public.profiles where id = p_user;
  insert into public.premium_group_members (group_id, user_id, premium_before)
  values (p_group, p_user, before);
  update public.profiles
     set premium_until = g_end, premium_announce = true
   where id = p_user and (premium_until is null or premium_until < g_end);
  -- Any other pending invitations to this person can't be accepted any more.
  update public.premium_group_invites
     set status = 'cancelled', responded_at = now()
   where invitee_id = p_user and status = 'pending' and group_id <> p_group;
end;
$fn$;

-- ------------------------------------------------------------------ join (0077 superset)
create or replace function public.friends_join(p_user uuid, p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  g public.premium_groups;
  mine uuid;
begin
  select * into g from public.premium_groups
   where invite_code = upper(trim(p_code)) for update;
  if not found then return 'not_found'; end if;

  select group_id into mine from public.premium_group_members where user_id = p_user;
  if mine = g.id then return 'already'; end if;
  if mine is not null then return 'other_group'; end if;
  if g.expires_at <= now() then return 'expired'; end if;

  -- A personal invitation to this person already holds their seat.
  if public.friends_seats_used(g.id, p_user) >= g.seats then return 'full'; end if;

  perform public.friends_add_member(g.id, p_user);
  update public.premium_group_invites
     set status = 'accepted', responded_at = now()
   where group_id = g.id and invitee_id = p_user and status = 'pending';
  return 'joined';
end;
$fn$;

-- ------------------------------------------------------------------ invitations
create or replace function public.friends_invite(p_owner uuid, p_invitee uuid)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  g public.premium_groups;
  their uuid;
begin
  select * into g from public.premium_groups where owner_id = p_owner for update;
  if not found then return 'no_group'; end if;
  if g.expires_at <= now() then return 'expired_group'; end if;
  if p_invitee = p_owner then return 'self'; end if;
  if not exists (select 1 from public.profiles where id = p_invitee) then return 'no_user'; end if;

  select group_id into their from public.premium_group_members where user_id = p_invitee;
  if their = g.id then return 'member'; end if;
  if their is not null then return 'other_group'; end if;

  -- Expired pending rows become 'expired', so a fresh invitation can be sent.
  update public.premium_group_invites
     set status = 'expired'
   where group_id = g.id and status = 'pending' and expires_at <= now();

  if exists (select 1 from public.premium_group_invites
              where group_id = g.id and invitee_id = p_invitee and status = 'pending') then
    return 'already_invited';
  end if;
  if public.friends_seats_used(g.id) >= g.seats then return 'full'; end if;

  insert into public.premium_group_invites (group_id, invitee_id, invited_by)
  values (g.id, p_invitee, p_owner);
  return 'invited';
end;
$fn$;

create or replace function public.friends_respond(p_user uuid, p_invite uuid, p_accept boolean)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  i public.premium_group_invites;
  g public.premium_groups;
begin
  select * into i from public.premium_group_invites where id = p_invite;
  if not found or i.invitee_id <> p_user then return 'not_found'; end if;
  select * into g from public.premium_groups where id = i.group_id for update;
  select * into i from public.premium_group_invites where id = p_invite for update;
  if i.status <> 'pending' then return i.status; end if;
  if i.expires_at <= now() then
    update public.premium_group_invites set status = 'expired' where id = i.id;
    return 'expired';
  end if;

  if not p_accept then
    update public.premium_group_invites set status = 'declined', responded_at = now() where id = i.id;
    return 'declined';
  end if;

  if exists (select 1 from public.premium_group_members where user_id = p_user) then
    return 'other_group';
  end if;
  if g.expires_at <= now() then return 'expired_group'; end if;

  perform public.friends_add_member(g.id, p_user);
  update public.premium_group_invites set status = 'accepted', responded_at = now() where id = i.id;
  return 'joined';
end;
$fn$;

create or replace function public.friends_cancel_invite(p_owner uuid, p_invite uuid)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
begin
  update public.premium_group_invites i
     set status = 'cancelled', responded_at = now()
    from public.premium_groups g
   where i.id = p_invite and i.group_id = g.id and i.status = 'pending'
     and (g.owner_id = p_owner or public.is_admin(p_owner));
  return case when found then 'cancelled' else 'not_found' end;
end;
$fn$;

-- ------------------------------------------------------------------ leave / remove
create or replace function public.friends_leave(p_user uuid)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  m public.premium_group_members;
  g public.premium_groups;
begin
  select * into m from public.premium_group_members where user_id = p_user;
  if not found then return 'not_member'; end if;
  select * into g from public.premium_groups where id = m.group_id for update;
  if g.owner_id = p_user then return 'owner'; end if;
  perform public.friends_restore_premium(g.id, p_user, m.premium_before);
  delete from public.premium_group_members where user_id = p_user;
  return 'left';
end;
$fn$;

create or replace function public.friends_remove_inactive(p_owner uuid, p_member uuid)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  g public.premium_groups;
  m public.premium_group_members;
begin
  select * into g from public.premium_groups where owner_id = p_owner for update;
  if not found then return 'no_group'; end if;
  select * into m from public.premium_group_members where group_id = g.id and user_id = p_member;
  if not found then return 'not_member'; end if;
  if p_member = p_owner then return 'owner'; end if;
  if exists (select 1 from public.results r where r.user_id = p_member and r.submitted_at >= m.joined_at) then
    return 'active';
  end if;
  perform public.friends_restore_premium(g.id, p_member, m.premium_before);
  delete from public.premium_group_members where group_id = g.id and user_id = p_member;
  return 'removed';
end;
$fn$;

-- 0077's admin remove, now restoring Premium too.
create or replace function public.admin_friends_remove_as(p_actor uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  m public.premium_group_members;
  g public.premium_groups;
begin
  if not public.is_admin(p_actor) then
    raise exception 'admins only' using errcode = '42501';
  end if;
  select * into m from public.premium_group_members where user_id = p_user;
  if not found then return; end if;
  select * into g from public.premium_groups where id = m.group_id for update;
  if g.owner_id = p_user then return; end if;   -- change the buyer first
  perform public.friends_restore_premium(g.id, p_user, m.premium_before);
  delete from public.premium_group_members where user_id = p_user;
end;
$fn$;

-- ------------------------------------------------------------------ name / admin
create or replace function public.friends_rename(p_actor uuid, p_group uuid, p_name text)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  n text := nullif(regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g'), '');
begin
  if n is not null and char_length(n) not between 2 and 30 then return 'bad_name'; end if;
  update public.premium_groups
     set name = n, name_changed_at = now()
   where id = p_group and (owner_id = p_actor or public.is_admin(p_actor));
  return case when found then 'renamed' else 'not_allowed' end;
end;
$fn$;

create or replace function public.admin_friends_hide_as(p_actor uuid, p_group uuid, p_hidden boolean)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not public.is_admin(p_actor) then
    raise exception 'admins only' using errcode = '42501';
  end if;
  update public.premium_groups set hidden_from_leaderboard = p_hidden where id = p_group;
end;
$fn$;

create or replace function public.admin_friends_set_owner_as(p_actor uuid, p_group uuid, p_new_owner uuid)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not public.is_admin(p_actor) then
    raise exception 'admins only' using errcode = '42501';
  end if;
  if not exists (select 1 from public.premium_group_members where group_id = p_group and user_id = p_new_owner) then
    return 'not_member';
  end if;
  update public.premium_groups set owner_id = p_new_owner where id = p_group;
  return 'changed';
end;
$fn$;

-- ------------------------------------------------------------------ nudges
create or replace function public.friends_nudge(p_from uuid, p_to uuid)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  g_from uuid;
  g_to uuid;
  today date := (now() at time zone 'Asia/Tashkent')::date;
  who text;
begin
  if p_from = p_to then return 'not_friends'; end if;
  select group_id into g_from from public.premium_group_members where user_id = p_from;
  select group_id into g_to from public.premium_group_members where user_id = p_to;
  if g_from is null or g_from is distinct from g_to then return 'not_friends'; end if;
  if (select friends_mute_nudges from public.profiles where id = p_to) then return 'muted'; end if;
  if exists (select 1 from public.results r
              where r.user_id = p_to and (r.submitted_at at time zone 'Asia/Tashkent')::date = today) then
    return 'practised';
  end if;

  insert into public.friends_nudges (from_id, to_id, day) values (p_from, p_to, today)
  on conflict do nothing;
  if not found then return 'already'; end if;

  select coalesce(nullif(split_part(trim(coalesce(name, '')), ' ', 1), ''), 'A friend') into who
    from public.profiles where id = p_from;
  insert into public.notifications (user_id, type, title, body, data)
  values (p_to, 'friends_nudge', who || ' nudged you',
          'Your friends are practising today. Take one test to keep up with your group!',
          jsonb_build_object('href', '/premium/group'));
  return 'sent';
end;
$fn$;

-- ------------------------------------------------------------------ weekly goal
-- {done, target, members, reached} for a group this week.
create or replace function public.friends_goal_progress(p_group uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $fn$
  with m as (select user_id from public.premium_group_members where group_id = p_group)
  select jsonb_build_object(
    'members', (select count(*) from m),
    'target',  5 * (select count(*) from m),
    'done',    (select count(*) from (
                  select distinct r.user_id, r.test_id from public.results r
                   where r.user_id in (select user_id from m)
                     and r.test_id is not null
                     and r.submitted_at >= public.friends_week_start()) d),
    'reached', exists (select 1 from public.premium_group_goal_weeks w
                        where w.group_id = p_group
                          and w.week_start = public.friends_week_start()::date)
  )
$fn$;

create or replace function public.friends_goal_check(p_user uuid)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  g public.premium_groups;
  pr jsonb;
  wk date := public.friends_week_start()::date;
begin
  select g2.* into g from public.premium_groups g2
    join public.premium_group_members m on m.group_id = g2.id
   where m.user_id = p_user and g2.expires_at > now();
  if not found then return 'no_group'; end if;

  pr := public.friends_goal_progress(g.id);
  if (pr->>'reached')::boolean then return 'already'; end if;
  if (pr->>'members')::int < 2 or (pr->>'done')::int < (pr->>'target')::int then return 'progress'; end if;

  insert into public.premium_group_goal_weeks (group_id, week_start, target)
  values (g.id, wk, (pr->>'target')::int)
  on conflict do nothing;
  if not found then return 'already'; end if;

  update public.profiles p set xp = p.xp + 100
    from public.premium_group_members m
   where m.group_id = g.id and p.id = m.user_id;
  insert into public.notifications (user_id, type, title, body, data)
  select m.user_id, 'friends_goal', 'Your group reached this week''s goal!',
         '+100 XP for everyone in ' || public.friends_group_name(g.id) || '. A new goal starts on Monday.',
         jsonb_build_object('href', '/premium/group')
    from public.premium_group_members m where m.group_id = g.id;
  return 'reached';
end;
$fn$;

-- ------------------------------------------------------------------ group leaderboard
-- All ranked groups (there are few): the app shows the top 10 and the viewer's own.
-- p_kind 'weekly' = rated points this week per member; 'rating' = members' average rating.
create or replace function public.friends_group_leaderboard(p_kind text default 'weekly')
returns table (group_id uuid, name text, members int, score int, rank bigint)
language sql
stable
security definer
set search_path = public
as $fn$
  with g as (
    select g.id, public.friends_group_name(g.id) as name,
           (select count(*) from public.premium_group_members m where m.group_id = g.id)::int as members
      from public.premium_groups g
     where g.expires_at > now() and not g.hidden_from_leaderboard
  ), s as (
    select g.id, g.name, g.members,
           case when p_kind = 'rating' then
             (select round(avg(p.rating))::int from public.premium_group_members m
                join public.profiles p on p.id = m.user_id where m.group_id = g.id)
           else
             (select coalesce(round(sum(r.points)::numeric / g.members), 0)::int
                from public.results r
                join public.premium_group_members m on m.user_id = r.user_id and m.group_id = g.id
               where r.rated and r.submitted_at >= public.friends_week_start())
           end as score
      from g where g.members >= 2
  )
  select s.id, s.name, s.members, s.score, rank() over (order by s.score desc, s.members desc)
    from s
   order by 5, 2
$fn$;

-- ------------------------------------------------------------------ public profile (0018 superset)
create or replace function public.public_profile(p_id uuid)
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select jsonb_build_object(
    'id',              p.id,
    'name',            p.name,
    'avatar_url',      p.avatar_url,
    'rating',          p.rating,
    'peak_rating',     p.peak_rating,
    'rated_count',     p.rated_count,
    'member_since',    p.created_at,
    'tests_completed', (select count(*) from public.results r where r.user_id = p.id),
    'global_rank',     (select g.rank from public.leaderboard_global g where g.id = p.id),
    'best_band',       (select max(r.band) from public.results r
                          where r.user_id = p.id and r.skill = 'reading'),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object('r', h.rating_after, 'at', h.submitted_at)
                        order by h.submitted_at)
      from (
        select rating_after, submitted_at from public.results
        where user_id = p.id and rated and skill = 'reading' and rating_after is not null
        order by submitted_at desc limit 30
      ) h
    ), '[]'::jsonb),
    'achievements', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', a.id, 'name', a.name, 'icon', a.icon,
               'category', a.category, 'earned_at', ua.earned_at)
             order by ua.earned_at)
      from public.user_achievements ua
      join public.achievements a on a.id = ua.achievement_id
      where ua.user_id = p.id
    ), '[]'::jsonb),
    -- 0078: streak (made live in the app with the timezone) and this week's points.
    'streak',             p.streak,
    'last_activity_date', p.last_activity_date,
    'timezone',           p.timezone,
    'weekly_points', (select coalesce(sum(r.points), 0)::int from public.results r
                       where r.user_id = p.id and r.rated
                         and r.submitted_at >= public.friends_week_start())
  )
  from public.profiles p
  where p.id = p_id;
$$;

grant execute on function public.public_profile(uuid) to anon, authenticated;

-- ------------------------------------------------------------------ grants
do $g$
declare f text;
begin
  foreach f in array array[
    'public.friends_group_name(uuid)',
    'public.friends_seats_used(uuid, uuid)',
    'public.friends_restore_premium(uuid, uuid, timestamptz)',
    'public.friends_add_member(uuid, uuid)',
    'public.friends_join(uuid, text)',
    'public.friends_invite(uuid, uuid)',
    'public.friends_respond(uuid, uuid, boolean)',
    'public.friends_cancel_invite(uuid, uuid)',
    'public.friends_leave(uuid)',
    'public.friends_remove_inactive(uuid, uuid)',
    'public.admin_friends_remove_as(uuid, uuid)',
    'public.friends_rename(uuid, uuid, text)',
    'public.admin_friends_hide_as(uuid, uuid, boolean)',
    'public.admin_friends_set_owner_as(uuid, uuid, uuid)',
    'public.friends_nudge(uuid, uuid)',
    'public.friends_goal_progress(uuid)',
    'public.friends_goal_check(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $g$;

revoke all on function public.friends_group_leaderboard(text) from public, anon;
grant execute on function public.friends_group_leaderboard(text) to authenticated, service_role;
grant execute on function public.friends_week_start() to anon, authenticated, service_role;
