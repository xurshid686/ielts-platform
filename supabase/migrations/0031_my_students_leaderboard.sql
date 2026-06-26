-- ============================================================
-- IELTS Platform — 0031: private My-students leaderboard (admin-only)
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to re-run.
-- ============================================================
-- A leaderboard of ONLY the teacher's My-students, readable ONLY by admins.
-- My-students still appear on the public leaderboard_* views unchanged; this
-- is an extra private board the students themselves never see. A plain view
-- can't be admin-gated cleanly, so this is a SECURITY DEFINER RPC that raises
-- for non-admins (mirrors set_leaderboard_hidden's is_admin guard).
-- ============================================================

set check_function_bodies = off;

create or replace function public.my_students_leaderboard()
returns table (
  id              uuid,
  name            text,
  email           text,
  avatar_url      text,
  rating          int,
  peak_rating     int,
  rated_count     int,
  tests_completed bigint,
  xp              int,
  streak          int,
  level           text,
  rank            bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only admins can view the My-students leaderboard';
  end if;

  return query
    select
      p.id, p.name, p.email, p.avatar_url,
      p.rating, p.peak_rating, p.rated_count,
      (select count(*) from public.results r where r.user_id = p.id) as tests_completed,
      p.xp, p.streak, p.level,
      rank() over (order by p.rating desc, p.rated_count desc) as rank
    from public.profiles p
    where p.is_my_student = true;
end;
$$;

grant execute on function public.my_students_leaderboard() to authenticated;

-- ============================================================
-- VERIFY (optional, as an admin):
--   select * from public.my_students_leaderboard();
--   -- as a non-admin this must FAIL.
-- ============================================================
