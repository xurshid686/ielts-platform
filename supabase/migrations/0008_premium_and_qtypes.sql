-- ============================================================
-- IELTS Platform — 0008: premium tier + question types
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to re-run.
-- ============================================================

-- Tests: free vs premium, and which question types they contain.
alter table public.tests
  add column if not exists tier text not null default 'free'
    check (tier in ('free', 'premium')),
  add column if not exists question_types text[] not null default '{}';

create index if not exists tests_tier_idx on public.tests(skill, tier);

-- Profiles: premium membership expiry (NULL = not a premium member).
alter table public.profiles
  add column if not exists premium_until timestamptz;

-- True while a user's premium membership is active.
create or replace function public.is_premium(uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = uid and premium_until is not null and premium_until > now()
  );
$$;

-- Grant/extend (months > 0) or revoke (months <= 0) premium for a user by email.
-- Admin-only, enforced in the DB.
create or replace function public.set_premium(target_email text, months int)
returns table (id uuid, email text, name text, premium_until timestamptz)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_caller uuid := auth.uid();
  v_id     uuid;
  v_until  timestamptz;
begin
  if not public.is_admin(v_caller) then
    raise exception 'Only admins can change membership';
  end if;

  select p.id into v_id
  from public.profiles p
  where lower(p.email) = lower(btrim(target_email));

  if v_id is null then
    raise exception 'No account found with that email';
  end if;

  if months is null or months <= 0 then
    v_until := null; -- revoke
  else
    -- Extend from the later of now or an existing future expiry.
    select greatest(now(), coalesce(p.premium_until, now())) + make_interval(months => months)
      into v_until
    from public.profiles p where p.id = v_id;
  end if;

  update public.profiles set premium_until = v_until where id = v_id;

  return query
    select p.id, p.email, p.name, p.premium_until
    from public.profiles p where p.id = v_id;
end;
$$;

grant execute on function public.is_premium(uuid) to authenticated;
grant execute on function public.set_premium(text, int) to authenticated;
-- ============================================================
