-- ============================================================
-- IELTS Platform — 0005: promote/revoke admins by email
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to re-run.
-- ============================================================
-- profiles RLS only allows a user to update their OWN row, so an admin can't
-- change someone else's role directly. This SECURITY DEFINER function runs with
-- elevated rights but enforces an admin check itself — no service-role key
-- needs to leave the server.

create or replace function public.set_user_role(target_email text, new_role text)
returns table (id uuid, email text, name text, role text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller    uuid := auth.uid();
  v_target_id uuid;
begin
  if not public.is_admin(v_caller) then
    raise exception 'Only admins can change roles';
  end if;
  if new_role not in ('admin', 'student') then
    raise exception 'Invalid role';
  end if;

  select p.id into v_target_id
  from public.profiles p
  where lower(p.email) = lower(btrim(target_email));

  if v_target_id is null then
    raise exception 'No account found with that email — the person must sign up first';
  end if;

  -- Guard against an admin accidentally locking themselves out.
  if v_target_id = v_caller and new_role <> 'admin' then
    raise exception 'You cannot remove your own admin access';
  end if;

  update public.profiles p set role = new_role where p.id = v_target_id;

  return query
    select p.id, p.email, p.name, p.role
    from public.profiles p
    where p.id = v_target_id;
end;
$$;

grant execute on function public.set_user_role(text, text) to authenticated;
-- ============================================================
