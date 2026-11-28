-- 0080: save the buyer's pre-group Premium date (Friends review, 2026-11-28).
--
-- friends_add_member (0078) stores premium_before for everyone who JOINS a group,
-- but friends_extend (0077) inserted the BUYER's own member row without it. That only
-- mattered after an admin changed the buyer (admin_friends_set_owner_as): the old
-- buyer became an ordinary member with premium_before = null, and if they then left,
-- friends_restore_premium set their Premium to now() even when they had personal
-- Premium of their own that the group had covered.
--
-- This replaces friends_extend with the same body, except the new group's owner row
-- carries premium_before. Grants are unchanged (0077 revoked it from public, anon and
-- authenticated; replacing a function keeps its privileges).
--
-- Existing groups are NOT backfilled: their buyer's original date is not recorded
-- anywhere. Backward compatible: no table or signature changes, nothing else reads it.

create or replace function public.friends_extend(p_owner uuid, p_months int, p_by uuid default null)
returns public.premium_groups
language plpgsql
security definer
set search_path = public
as $fn$
declare
  g public.premium_groups;
begin
  if p_months is null or p_months < 1 or p_months > 24 then
    raise exception 'bad months' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_owner) then
    raise exception 'no such user' using errcode = 'P0002';
  end if;
  -- The organiser can't run a group while being a guest in someone else's.
  if exists (select 1 from public.premium_group_members m
              join public.premium_groups pg on pg.id = m.group_id
             where m.user_id = p_owner and pg.owner_id <> p_owner) then
    raise exception 'already a member of another group' using errcode = 'P0001';
  end if;

  select * into g from public.premium_groups where owner_id = p_owner for update;
  if not found then
    loop
      begin
        insert into public.premium_groups (owner_id, expires_at, invite_code, created_by)
        values (p_owner, now() + make_interval(months => p_months), public.friends_new_code(), p_by)
        returning * into g;
        exit;
      exception when unique_violation then
        -- a code collision (astronomically rare): try another code
        if exists (select 1 from public.premium_groups where owner_id = p_owner) then raise; end if;
      end;
    end loop;
    -- 0080: remember the buyer's own Premium date BEFORE the group raises it (below), the
    -- way friends_add_member does for everyone else. If an admin later changes the buyer and
    -- this person leaves, friends_restore_premium can then give it back.
    insert into public.premium_group_members (group_id, user_id, premium_before)
    values (g.id, p_owner, (select premium_until from public.profiles where id = p_owner))
    on conflict do nothing;
  else
    update public.premium_groups
       set expires_at = greatest(now(), expires_at) + make_interval(months => p_months)
     where id = g.id
     returning * into g;
  end if;

  update public.profiles p
     set premium_until = g.expires_at,
         premium_announce = true
    from public.premium_group_members m
   where m.group_id = g.id and p.id = m.user_id
     and (p.premium_until is null or p.premium_until < g.expires_at);

  return g;
end;
$fn$;
