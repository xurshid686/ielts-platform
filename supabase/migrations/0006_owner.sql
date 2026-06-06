-- ============================================================
-- IELTS Platform — 0006: single owner above admins
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to re-run. SUPERSEDES the set_user_role from 0005.
-- ============================================================
-- Only the OWNER may promote/revoke admins, and the owner's own access can't
-- be changed by anyone. Owner is data-driven (a flag), enforced in the DB.

alter table public.profiles
  add column if not exists is_owner boolean not null default false;

-- Designate the single owner (idempotent).
update public.profiles
  set is_owner = true, role = 'admin'
  where lower(email) = lower('aliqulovxurshid24@gmail.com');

create or replace function public.is_owner(uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = uid and is_owner = true);
$$;

-- Promote/revoke an admin by email. OWNER-ONLY, and the owner is untouchable.
create or replace function public.set_user_role(target_email text, new_role text)
returns table (id uuid, email text, name text, role text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_target public.profiles;
begin
  if not public.is_owner(v_caller) then
    raise exception 'Only the owner can change admin access';
  end if;
  if new_role not in ('admin', 'student') then
    raise exception 'Invalid role';
  end if;

  select * into v_target
  from public.profiles p
  where lower(p.email) = lower(btrim(target_email));

  if not found then
    raise exception 'No account found with that email — the person must sign up first';
  end if;
  if v_target.is_owner then
    raise exception 'The owner''s access cannot be changed';
  end if;

  update public.profiles set role = new_role where id = v_target.id;

  return query
    select p.id, p.email, p.name, p.role
    from public.profiles p
    where p.id = v_target.id;
end;
$$;

grant execute on function public.is_owner(uuid) to authenticated;
grant execute on function public.set_user_role(text, text) to authenticated;
-- ============================================================
