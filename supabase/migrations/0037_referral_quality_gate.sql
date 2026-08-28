-- ============================================================
-- IELTS Platform — 0037: a referral qualifies on real work, not any row
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to re-run.
-- ============================================================
--
-- *** BACKWARD COMPATIBLE. Safe to run before or after a deploy. ***
--
-- WHAT WAS WRONG
--
-- 0019 attached qualify_referral_on_result() to `after insert on results`
-- FOR EVERY ROW, with no test of whether the row represents a completed test.
-- The body checked only that a pending referral existed, then granted the
-- referrer a month of Premium.
--
-- Meanwhile `results_insert_owner` (0001:135) lets any authenticated user
-- INSERT their own results row directly through PostgREST — saveResult() is
-- not in that path and cannot gate it. So the loop was:
--
--   register with a referral code -> insert one junk row -> collect a month
--
-- fully scriptable with disposable accounts, for unlimited free Premium.
--
-- THE GATE
--
-- The row must point at a real test, carry a real question count, and have
-- taken at least two minutes. Deliberately NOT `new.rated` — that is true
-- only for first-attempt READING papers, and a friend whose first activity is
-- a listening test should still qualify the person who invited them.
--
-- TO ROLL BACK (restores the ungated behaviour):
--   re-run the function body from 0019_referrals.sql:187
--
-- ============================================================

create or replace function public.qualify_referral_on_result()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref     public.referrals%rowtype;
  v_months  int;
  v_until   timestamptz;
  v_name    text;
begin
  -- A referral is earned by finishing a real test, not by writing a row.
  -- 10 questions is below the smallest genuine paper; 120s is below any
  -- honest completion of one.
  if new.test_id is null
     or coalesce(new.total, 0) < 10
     or coalesce(new.duration_seconds, 0) < 120 then
    return new;
  end if;

  -- Find a still-pending referral where NEW.user_id is the referred friend.
  select * into v_ref
  from public.referrals
  where referred_id = new.user_id and status = 'pending'
  for update;

  if not found then
    return new;                          -- not referred, or already qualified
  end if;

  v_months := greatest(1, coalesce(v_ref.reward_months, 1));

  -- Extend the referrer's Premium from the later of now / their current expiry.
  select greatest(now(), coalesce(premium_until, now())) + make_interval(months => v_months)
    into v_until
  from public.profiles where id = v_ref.referrer_id;

  update public.profiles
     set premium_until = v_until,
         premium_announce = true
   where id = v_ref.referrer_id;

  update public.referrals
     set status = 'qualified', qualified_at = now()
   where id = v_ref.id;

  -- Tell the referrer they earned a free month.
  select coalesce(name, 'Your friend') into v_name from public.profiles where id = new.user_id;
  insert into public.notifications (user_id, type, title, body, data)
  values (
    v_ref.referrer_id,
    'referral',
    'You earned ' || v_months || ' month' || (case when v_months = 1 then '' else 's' end) || ' of Premium! 🎉',
    v_name || ' completed their first test through your invite.',
    jsonb_build_object('referred_id', new.user_id, 'months', v_months)
  );

  return new;
end;
$$;

-- The trigger itself is unchanged; only the body now decides.
