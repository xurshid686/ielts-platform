-- 0068 — remove the referral program ("get Premium free by inviting a friend"), owner 2026-11-20
--
-- *** NOT backward compatible. ORDER: deploy the code that no longer uses referrals -> confirm it
-- *** is live on the CANONICAL host (mockonline.uz, DigitalOcean) -> THEN run this. The old code
-- *** calls redeem_referral() and reads profiles.referral_code; this migration drops both.
--
-- WHAT IT REMOVES (all of 0019 + 0037):
--   * the on_result_referral trigger and qualify_referral_on_result()  (what granted Premium)
--   * redeem_referral(), gen_referral_code(), referral_reward_months(), referral_welcome_xp()
--   * the referrals table (and its policy / index)
--   * profiles.referral_code and profiles.referred_by (and their unique / foreign key / index)
--
-- TWO LIVE FUNCTIONS READ THE COLUMNS AND ARE REWRITTEN FIRST, in this same transaction:
--   * handle_new_user() — runs on EVERY sign-up and fills referral_code through gen_referral_code().
--     Dropping the column or the function before rewriting it would break registration for everyone.
--   * protect_profile_privileged_fields() — the guard on every profile UPDATE lists both columns.
-- Rewritten from the LIVE definitions (read with scripts/check-referral-deps.mjs on 2026-11-20), minus
-- the referral lines. Everything else in them is unchanged.
--
-- WHAT IS KEPT: the 61 referral rows and every account's code / referrer are copied into the private
-- `archive` schema first (revoked from anon / authenticated, like the 0039 removals). Months of
-- Premium already granted stay as they are (profiles.premium_until is untouched), and old
-- notifications of type 'referral' stay in `notifications`.
--
-- TO ROLL BACK: the archive holds the data, and 0019 + 0037 hold the definitions. Re-run them,
-- then copy archive.referrals / archive.profile_referral_codes back. (Nothing is expected to need it.)

-- ------------------------------------------------------------------ 1. archive what must be kept
create schema if not exists archive;
revoke all on schema archive from public, anon, authenticated;

do $$
begin
  if to_regclass('public.referrals') is not null and to_regclass('archive.referrals') is null then
    create table archive.referrals as table public.referrals;
  end if;
  if to_regclass('archive.profile_referral_codes') is null
     and exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'profiles' and column_name = 'referral_code') then
    create table archive.profile_referral_codes as
      select id, referral_code, referred_by
        from public.profiles
       where referral_code is not null or referred_by is not null;
  end if;
end $$;

revoke all on all tables in schema archive from public, anon, authenticated;

-- ------------------------------------------------------------------ 2. rewrite the two readers FIRST
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1)
    ),
    new.email,
    coalesce(
      new.raw_user_meta_data->>'avatar_url',
      new.raw_user_meta_data->>'picture'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- SECURITY INVOKER (the default) on purpose, as in 0039 / 0061.
create or replace function public.protect_profile_privileged_fields()
returns trigger
language plpgsql
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
       or new.hidden_from_leaderboard is distinct from old.hidden_from_leaderboard
       or new.unsubscribe_token    is distinct from old.unsubscribe_token
    then
      raise exception 'You may not modify privileged profile fields.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- ------------------------------------------------------------------ 3. stop the reward
drop trigger if exists on_result_referral on public.results;
drop function if exists public.qualify_referral_on_result();

-- ------------------------------------------------------------------ 4. drop the objects
drop table if exists public.referrals;                 -- takes its policy and index with it
drop function if exists public.redeem_referral(text);
drop function if exists public.gen_referral_code();
drop function if exists public.referral_reward_months();
drop function if exists public.referral_welcome_xp();

-- ------------------------------------------------------------------ 5. the columns
-- (drops profiles_referral_code_key, profiles_referred_by_fkey and profiles_referred_by_idx with them)
alter table public.profiles
  drop column if exists referral_code,
  drop column if exists referred_by;
