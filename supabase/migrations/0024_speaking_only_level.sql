-- ============================================================
-- IELTS Platform — 0024: 'speaking_only' student level
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to re-run.
-- ============================================================
-- WHAT THIS ADDS
--   A fourth value for profiles.level:
--     'speaking_only' — students who may use ONLY the Speaking section.
--   These students are gated app-side (proxy.ts + the sidebar) so they
--   never see Reading / Listening / Writing / Dashboard / Compete pages;
--   any other app route redirects them back to /speaking.
--   Admins assign it from Admin -> Members, exactly like the other levels.
-- ============================================================

set check_function_bodies = off;

-- 1. ------------------------------------ allow the new level on profiles
alter table public.profiles drop constraint if exists profiles_level_check;
alter table public.profiles
  add constraint profiles_level_check
  check (level in ('regular', 'pre_ielts', 'intro', 'speaking_only'));

-- 2. ----------------------- accept the new level in the admin-only setter
create or replace function public.set_user_level(target_email text, new_level text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text;
  updated_email text;
begin
  if new_level not in ('regular', 'pre_ielts', 'intro', 'speaking_only') then
    raise exception 'Invalid level: %', new_level using errcode = '22023';
  end if;

  select role into caller_role from profiles where id = auth.uid();
  if caller_role is distinct from 'admin' then
    raise exception 'Only admins may set a student level.' using errcode = '42501';
  end if;

  update profiles
     set level = new_level
   where lower(email) = lower(trim(target_email))
   returning email into updated_email;

  if updated_email is null then
    raise exception 'No user found with that email.' using errcode = 'no_data_found';
  end if;

  return new_level;
end;
$$;

revoke all on function public.set_user_level(text, text) from public, anon;
grant execute on function public.set_user_level(text, text) to authenticated;

-- ============================================================
-- VERIFY (optional):
--   select level, count(*) from public.profiles group by level;
--   -- as a non-admin this must FAIL:
--   select public.set_user_level('someone@example.com', 'speaking_only');
-- ============================================================
