-- ============================================================
-- IELTS Platform — 0014: block privilege/economy self-escalation
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to re-run.  ⚠️ SECURITY-CRITICAL — apply before sharing the site.
-- ============================================================
-- THE HOLE THIS CLOSES
-- The base policy `profiles_update_self` lets a user update their OWN row.
-- Nothing restricted WHICH columns, so any signed-in user could call the
-- public REST API directly:
--
--     supabase.from('profiles').update({ role: 'admin', is_owner: true })
--                               .eq('id', <their own id>)
--
-- …becoming an admin, after which the `tests_admin_all` RLS policy would let
-- them DELETE every test (and the storage policy delete the HTML files), plus
-- self-grant premium and inflate XP.
--
-- THE FIX
-- A BEFORE UPDATE trigger that rejects changes to privileged/economy columns
-- when the change arrives via the public REST roles ('authenticated'/'anon').
-- Our trusted SECURITY DEFINER functions (record_activity, set_user_role,
-- grant_premium, gift_xp, unlock_test) run as the table owner — NOT those
-- roles — so they keep working. `premium_announce`, `name`, `avatar_url`,
-- `email` stay user-editable (the app legitimately updates premium_announce).

set check_function_bodies = off;

create or replace function public.protect_profile_privileged_fields()
returns trigger
language plpgsql
-- NOTE: intentionally SECURITY INVOKER (the default). We rely on current_user
-- reflecting the real executing role; do NOT add `security definer`.
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.role               is distinct from old.role
       or new.is_owner          is distinct from old.is_owner
       or new.xp                is distinct from old.xp
       or new.premium_until     is distinct from old.premium_until
       or new.streak            is distinct from old.streak
       or new.longest_streak    is distinct from old.longest_streak
       or new.last_activity_date is distinct from old.last_activity_date
    then
      raise exception 'You may not modify privileged profile fields.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_profile_privileged on public.profiles;
create trigger trg_protect_profile_privileged
  before update on public.profiles
  for each row execute function public.protect_profile_privileged_fields();

-- ============================================================
-- VERIFY (optional): signed in as a normal user, this should now FAIL:
--   update public.profiles set role='admin' where id = auth.uid();
-- while name/avatar updates still succeed.
-- ============================================================
