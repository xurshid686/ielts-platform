-- ============================================================
-- IELTS Platform — 0009: unlock premium tests with XP + premium welcome
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to re-run.
-- ============================================================

-- One row per (user, premium test) the user has unlocked by spending XP.
create table if not exists public.unlocks (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  test_id    uuid not null references public.tests(id) on delete cascade,
  cost       int  not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, test_id)
);

alter table public.unlocks enable row level security;

drop policy if exists "unlocks_select_own" on public.unlocks;
create policy "unlocks_select_own" on public.unlocks
  for select using (auth.uid() = user_id);
-- No direct insert policy: rows are created only via unlock_test() below.

-- Shown-a-congrats flag: set when premium is granted, cleared once seen.
alter table public.profiles
  add column if not exists premium_announce boolean not null default false;

-- Spend XP to permanently unlock one premium test. Atomic + idempotent.
-- Cost: 60 XP for a single passage/section, 150 XP for a full test.
create or replace function public.unlock_test(p_test_id uuid)
returns table (xp int, cost int)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_caller uuid := auth.uid();
  v_tier   text;
  v_kind   text;
  v_cost   int;
  v_xp     int;
begin
  if v_caller is null then raise exception 'Not signed in'; end if;

  select tier, kind into v_tier, v_kind from public.tests where id = p_test_id;
  if v_tier is null then raise exception 'Test not found'; end if;
  if v_tier <> 'premium' then raise exception 'This test is already free'; end if;

  v_cost := case when v_kind = 'full' then 150 else 60 end;

  -- Already unlocked? Return current XP without charging again.
  if exists (select 1 from public.unlocks u where u.user_id = v_caller and u.test_id = p_test_id) then
    select p.xp into v_xp from public.profiles p where p.id = v_caller;
    return query select v_xp, v_cost;
    return;
  end if;

  select p.xp into v_xp from public.profiles p where p.id = v_caller for update;
  if v_xp < v_cost then
    raise exception 'Not enough XP — you need % XP to unlock this test', v_cost;
  end if;

  update public.profiles as p set xp = p.xp - v_cost where p.id = v_caller;
  insert into public.unlocks (user_id, test_id, cost) values (v_caller, p_test_id, v_cost);

  return query select (v_xp - v_cost), v_cost;
end;
$$;

grant execute on function public.unlock_test(uuid) to authenticated;

-- Redefine set_premium (from 0008) so granting also raises the welcome flag.
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

  select p.id into v_id from public.profiles p
  where lower(p.email) = lower(btrim(target_email));
  if v_id is null then raise exception 'No account found with that email'; end if;

  if months is null or months <= 0 then
    v_until := null;
  else
    select greatest(now(), coalesce(p.premium_until, now())) + make_interval(months => months)
      into v_until from public.profiles p where p.id = v_id;
  end if;

  update public.profiles
     set premium_until = v_until,
         premium_announce = (v_until is not null) -- congratulate on grant; clear on revoke
   where id = v_id;

  return query
    select p.id, p.email, p.name, p.premium_until
    from public.profiles p where p.id = v_id;
end;
$$;

grant execute on function public.set_premium(text, int) to authenticated;
-- ============================================================
