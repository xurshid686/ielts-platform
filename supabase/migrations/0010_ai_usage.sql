-- ============================================================
-- IELTS Platform — 0010: per-user daily AI usage limits
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to re-run.
-- ============================================================
-- Caps how many AI calls a user can make per day (per kind), to control cost.
-- Admins are unlimited; premium members get higher caps than free users.

create table if not exists public.ai_usage (
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind    text not null,                                  -- 'live' | 'tutor' | 'speaking_grade'
  day     date not null default (now() at time zone 'utc')::date,
  count   int  not null default 0,
  primary key (user_id, kind, day)
);

alter table public.ai_usage enable row level security;

drop policy if exists "ai_usage_select_own" on public.ai_usage;
create policy "ai_usage_select_own" on public.ai_usage
  for select using (auth.uid() = user_id);

-- Atomically check + consume one unit of the daily quota for a kind.
-- Returns true if allowed (and increments); false if the cap is reached.
create or replace function public.use_ai_quota(p_kind text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller  uuid := auth.uid();
  v_today   date := (now() at time zone 'utc')::date;
  v_limit   int;
  v_count   int;
  v_premium boolean;
begin
  if v_caller is null then return false; end if;
  if public.is_admin(v_caller) then return true; end if; -- admins: unlimited

  v_premium := public.is_premium(v_caller);
  v_limit := case p_kind
    when 'live'           then case when v_premium then 20  else 2  end
    when 'tutor'          then case when v_premium then 100 else 15 end
    when 'speaking_grade' then case when v_premium then 30  else 3  end
    else                       case when v_premium then 50  else 10 end
  end;

  insert into public.ai_usage (user_id, kind, day, count)
  values (v_caller, p_kind, v_today, 0)
  on conflict (user_id, kind, day) do nothing;

  select a.count into v_count
  from public.ai_usage a
  where a.user_id = v_caller and a.kind = p_kind and a.day = v_today
  for update;

  if v_count >= v_limit then return false; end if;

  update public.ai_usage
     set count = count + 1
   where user_id = v_caller and kind = p_kind and day = v_today;

  return true;
end;
$$;

grant execute on function public.use_ai_quota(text) to authenticated;
-- ============================================================
