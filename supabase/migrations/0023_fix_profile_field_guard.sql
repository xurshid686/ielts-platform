-- ============================================================
-- IELTS Platform — 0023: restore the FULL privileged-field guard
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to re-run.  ⚠️ SECURITY-CRITICAL — apply ASAP.
-- ============================================================
-- THE BUG
-- protect_profile_privileged_fields() was redefined with CREATE OR REPLACE in
-- 0014, 0016, 0019, 0020 and 0021. Only the LAST definition persists, and each
-- one re-listed the columns from scratch rather than appending. 0021's version
-- (the live one) guards only:
--   role, is_owner, xp, premium_until, streak, longest_streak,
--   last_activity_date, level
-- It silently dropped the guards added by:
--   0016 → rating, peak_rating, rated_count       (Elo leaderboard)
--   0019 → referral_code, referred_by             (referral economy)
--   0020 → hidden_from_leaderboard
--
-- IMPACT (currently exploitable by any signed-in user via the public REST API,
-- because profiles_update_self lets them update their own row):
--   supabase.from('profiles')
--     .update({ rating: 99999, peak_rating: 99999, rated_count: 999 })
--     .eq('id', <own id>)        -- tops the global leaderboard
--   …and tampering with referral_code / referred_by to farm referral rewards.
--
-- THE FIX
-- One authoritative definition guarding the UNION of every sensitive column.
-- Trusted SECURITY DEFINER functions (record_activity, set_user_role,
-- grant_premium, gift_xp, unlock_test, rating updates, referrals, …) run as the
-- table owner — not 'authenticated'/'anon' — so they are unaffected.
-- User-editable fields stay open: name, avatar_url, email, premium_announce,
-- target_band, timezone.
-- ============================================================

set check_function_bodies = off;

create or replace function public.protect_profile_privileged_fields()
returns trigger
language plpgsql
-- SECURITY INVOKER (default) on purpose: we test current_user against the real
-- executing role. Do NOT add `security definer`.
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.role                 is distinct from old.role
       or new.is_owner             is distinct from old.is_owner
       or new.xp                   is distinct from old.xp
       or new.premium_until        is distinct from old.premium_until
       or new.streak               is distinct from old.streak
       or new.longest_streak       is distinct from old.longest_streak
       or new.last_activity_date   is distinct from old.last_activity_date
       or new.level                is distinct from old.level
       or new.rating               is distinct from old.rating
       or new.peak_rating          is distinct from old.peak_rating
       or new.rated_count          is distinct from old.rated_count
       or new.referral_code        is distinct from old.referral_code
       or new.referred_by          is distinct from old.referred_by
       or new.hidden_from_leaderboard is distinct from old.hidden_from_leaderboard
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
-- VERIFY (as a normal signed-in user — every one of these should FAIL now):
--   update public.profiles set rating = 99999 where id = auth.uid();
--   update public.profiles set referred_by = null where id = auth.uid();
-- While these still succeed:
--   update public.profiles set timezone = 'Asia/Tashkent' where id = auth.uid();
--   update public.profiles set target_band = 7.5 where id = auth.uid();
-- ============================================================
