-- ============================================================
-- IELTS Platform — 0012: admin can gift XP
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to re-run.
-- ============================================================
-- Adds/removes XP for a user by email. Admin-only, enforced in the DB. A
-- negative amount deducts (balance never goes below 0).

create or replace function public.gift_xp(target_email text, amount int)
returns table (id uuid, email text, name text, xp int)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_caller uuid := auth.uid();
  v_id     uuid;
begin
  if not public.is_admin(v_caller) then
    raise exception 'Only admins can gift XP';
  end if;
  if amount is null or amount = 0 then
    raise exception 'Enter an XP amount';
  end if;

  select p.id into v_id from public.profiles p
  where lower(p.email) = lower(btrim(target_email));
  if v_id is null then
    raise exception 'No account found with that email';
  end if;

  update public.profiles as p
     set xp = greatest(0, p.xp + amount)
   where p.id = v_id;

  return query
    select p.id, p.email, p.name, p.xp
    from public.profiles p where p.id = v_id;
end;
$$;

grant execute on function public.gift_xp(text, int) to authenticated;
-- ============================================================
