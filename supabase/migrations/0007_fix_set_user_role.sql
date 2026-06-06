-- ============================================================
-- IELTS Platform — 0007: fix "column reference id is ambiguous"
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to re-run. Replaces set_user_role from 0006.
-- ============================================================
-- The RETURNS TABLE output columns (id, email, name, role) share names with
-- profiles columns, so unqualified references inside the body were ambiguous.
-- Fix: `#variable_conflict use_column`, select into scalars, and alias the
-- UPDATE target so every column reference is unambiguous.

create or replace function public.set_user_role(target_email text, new_role text)
returns table (id uuid, email text, name text, role text)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_caller       uuid := auth.uid();
  v_target_id    uuid;
  v_target_owner boolean;
begin
  if not public.is_owner(v_caller) then
    raise exception 'Only the owner can change admin access';
  end if;
  if new_role not in ('admin', 'student') then
    raise exception 'Invalid role';
  end if;

  select p.id, p.is_owner
    into v_target_id, v_target_owner
  from public.profiles p
  where lower(p.email) = lower(btrim(target_email));

  if v_target_id is null then
    raise exception 'No account found with that email — the person must sign up first';
  end if;
  if v_target_owner then
    raise exception 'The owner''s access cannot be changed';
  end if;

  update public.profiles as p
     set role = new_role
   where p.id = v_target_id;

  return query
    select p.id, p.email, p.name, p.role
    from public.profiles p
    where p.id = v_target_id;
end;
$$;

grant execute on function public.set_user_role(text, text) to authenticated;
-- ============================================================
