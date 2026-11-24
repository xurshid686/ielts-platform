-- 0075 — security audit 2026-11-25, before online payments go live.
--
-- ADDITIVE and backward compatible: no code depends on anything this removes,
-- so it may be applied before or after the matching deploy.
--
-- 1. profiles.email is no longer writable by its owner, is unique, and follows
--    auth.users. Until now a student could PATCH their own profiles.email to a
--    colleague's address; set_user_role / set_premium / gift_xp /
--    set_leaderboard_hidden / set_user_level / grant_discipline and the
--    TypeScript grant paths all find their target BY that email, so an admin
--    role or a paid Premium/Ultima grant could land on the attacker's row, and
--    platform email could be pointed at any address. With email immutable and
--    unique, every one of those lookups resolves exactly one real account,
--    so none of the RPCs needs rewriting.
--    Pre-flight on Frankfurt (2026-11-25): 1210 profiles, 0 duplicate emails,
--    0 profiles whose email differs from auth.users — nothing was exploited.
--
-- 2. The same guard also validates the user-writable fields it used to ignore:
--    avatar_url (only NULL or our own /api/avatar/<id>; was any URL — tracking
--    pixels on public profiles, and an undo for the admin's "Remove photo"),
--    name (<= 80 chars, no control characters), timezone (must be a zone
--    Postgres knows — ONE bad zone made the reminder crons'
--    `now() at time zone p.timezone` throw for every student), and
--    premium_announce (may only be switched off).
--    Each check fires only when the column CHANGES, so the 857 existing Google
--    avatar URLs stay valid.
--
-- 3. fulfil_payment_order pays only a PENDING order (one a provider transaction
--    has claimed). It used to accept `created` too; the routes never send one,
--    but the database is the last line.
--
-- 4. anon loses EXECUTE on the admin RPCs it still had (their own is_admin()
--    check already refused it). is_admin / is_premium keep their grants: RLS
--    policies call them as the querying role.
--
-- Verify: node scripts/check-0075.mjs

-- ------------------------------------------------------------------ 1+2. guard
-- SECURITY INVOKER (the default) on purpose, as in 0039 / 0061 / 0068.
-- Every column 0068 guarded is still guarded, unchanged.
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
       or new.email                is distinct from old.email
       or new.id                   is distinct from old.id
       or (new.premium_announce is distinct from old.premium_announce
           and new.premium_announce is not false)
    then
      raise exception 'You may not modify privileged profile fields.'
        using errcode = '42501';
    end if;

    if new.avatar_url is distinct from old.avatar_url
       and new.avatar_url is not null
       and new.avatar_url not like '/api/avatar/' || new.id::text || '%' then
      raise exception 'Invalid avatar.' using errcode = '22023';
    end if;

    if new.name is distinct from old.name
       and new.name is not null
       and (length(new.name) > 80 or new.name ~ '[[:cntrl:]]') then
      raise exception 'Invalid name.' using errcode = '22023';
    end if;

    if new.timezone is distinct from old.timezone
       and new.timezone is not null
       and not exists (select 1 from pg_timezone_names z where z.name = new.timezone) then
      raise exception 'Unknown time zone.' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

-- One account per address. auth.users is already unique on email, and the
-- pre-flight found no duplicates here, so this cannot fail on current data.
create unique index if not exists profiles_email_lower_key
  on public.profiles (lower(email));

-- Keep profiles.email equal to the sign-in address when a user changes it
-- through Supabase Auth (the only legitimate way an email changes now).
create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function public.sync_profile_email() from public, anon, authenticated;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.sync_profile_email();

-- PostgREST never issues these, but nothing needs them either.
revoke truncate, references, trigger on public.profiles from anon, authenticated;

-- ------------------------------------------------------------------ 3. payments
create or replace function public.fulfil_payment_order(p_order uuid, p_perform_time bigint default null)
returns public.payment_orders
language plpgsql
security definer
set search_path = public
as $fn$
declare
  o public.payment_orders;
  v_until timestamptz;
  v_ultima timestamptz;
begin
  select * into o from public.payment_orders where id = p_order for update;
  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;
  if o.status = 'paid' then
    return o;                                   -- idempotent
  end if;
  if o.status = 'cancelled' then
    raise exception 'order cancelled' using errcode = 'P0001';
  end if;
  -- 0075: only an order a provider transaction has claimed (attachTx) is payable.
  if o.status <> 'pending' then
    raise exception 'order not pending' using errcode = 'P0001';
  end if;

  if o.user_id is not null then
    update public.profiles p
       set premium_until = greatest(now(), coalesce(p.premium_until, now())) + make_interval(months => o.months),
           premium_announce = true
     where p.id = o.user_id
     returning p.premium_until into v_until;

    if o.plan = 'ultima' then
      insert into public.ultima_members as u (user_id, ultima_until, granted_by, granted_at)
      values (o.user_id, now() + make_interval(months => o.months), null, now())
      on conflict (user_id) do update
        set ultima_until = greatest(now(), u.ultima_until) + make_interval(months => o.months),
            granted_at = now()
      returning u.ultima_until into v_ultima;
    end if;
  end if;

  update public.payment_orders
     set status = 'paid',
         paid_at = now(),
         perform_time = coalesce(p_perform_time, perform_time),
         payme_state = case when provider = 'payme' then 2 else payme_state end,
         premium_until_after = v_until,
         ultima_until_after = v_ultima
   where id = p_order
   returning * into o;
  return o;
end;
$fn$;

revoke all on function public.fulfil_payment_order(uuid, bigint) from public, anon, authenticated;
grant execute on function public.fulfil_payment_order(uuid, bigint) to service_role;

-- ------------------------------------------------------------------ 4. anon
revoke execute on function public.set_user_role(text, text)            from public, anon;
revoke execute on function public.set_premium(text, int)               from public, anon;
revoke execute on function public.gift_xp(text, int)                   from public, anon;
revoke execute on function public.set_leaderboard_hidden(text, boolean) from public, anon;
revoke execute on function public.admin_send_weekly_report(uuid, date) from public, anon;
grant  execute on function public.set_user_role(text, text)            to authenticated;
grant  execute on function public.set_premium(text, int)               to authenticated;
grant  execute on function public.gift_xp(text, int)                   to authenticated;
grant  execute on function public.set_leaderboard_hidden(text, boolean) to authenticated;
grant  execute on function public.admin_send_weekly_report(uuid, date) to authenticated;
