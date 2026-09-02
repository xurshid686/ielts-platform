-- ============================================================
-- IELTS Platform — 0043: push a Telegram message when a student signs up
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to re-run.
-- ============================================================
--
-- *** APPLIED to Frankfurt 2026-09-02, and verified end to end. ***
--
-- Additive, but it adds a trigger to the SIGNUP PATH, which is why it is a
-- separate migration from 0042 and why it is not applied automatically.
--
-- ------------------------------------------------------------
-- WHY A TRIGGER, AND NOT APPLICATION CODE
-- ------------------------------------------------------------
-- `profiles` rows are written by handle_new_user() on auth.users (0001), and
-- registration — including Google sign-in — goes straight through the Supabase
-- client. There is no server action in the signup path to hook, which is why
-- the "new attempt" notification could be a plain after() call in saveResult()
-- and this one cannot.
--
-- A cron poll is not an option either: vercel.json's schedules only fire on the
-- Vercel copy of the app, and the live site is DigitalOcean (CLAUDE.md, "Where
-- production actually is"), so a poller would watch the wrong deployment.
--
-- ------------------------------------------------------------
-- WHY IT CANNOT BREAK SIGNUP
-- ------------------------------------------------------------
-- Three separate reasons, because this runs inside the transaction that
-- creates a user account and a failure there would lock people out:
--
--   1. The whole body is wrapped in `exception when others then null`. Any
--      error — pg_net missing, settings row absent, a malformed URL — is
--      swallowed.
--   2. net.http_post() is ASYNCHRONOUS. It queues a request and returns
--      immediately; it never waits for the app and never sees its response.
--   3. The trigger is AFTER INSERT, so the row is already written.
--
-- The cost of that safety: a failed push is invisible unless you look. Check
-- `select * from net._http_response order by created desc limit 10;`
--
-- ------------------------------------------------------------
-- BEFORE YOU RUN THIS
-- ------------------------------------------------------------
-- Set the two settings at the bottom, or the trigger does nothing (harmlessly):
--
--   TELEGRAM_EVENT_SECRET must match the value in the app's environment.
--   The URL must point at the host that is actually serving the app.
--
-- ------------------------------------------------------------
-- TO ROLL BACK
-- ------------------------------------------------------------
--   drop trigger if exists trg_notify_new_student on public.profiles;
--   drop function if exists public.tg_notify_new_student();
--   drop table if exists private.app_settings;
--   -- pg_net can be left enabled; nothing else uses it, and dropping the
--   -- extension discards its response log.
-- ============================================================

create extension if not exists pg_net with schema extensions;


-- ------------------------------------------------------------
-- Where the endpoint and its secret live.
-- ------------------------------------------------------------
-- In a table rather than in the function body so the URL can be repointed
-- (dev preview -> production) without redefining the trigger, and so the value
-- is visible to `select` when debugging.
--
-- The secret is only as sensitive as service-role access, which can already
-- read everything. It is NOT reachable by anon or authenticated: the schema
-- itself is revoked, so RLS is not the thing standing between them and it.
create schema if not exists private;
revoke all on schema private from anon, authenticated;

create table if not exists private.app_settings (
  key   text primary key,
  value text not null
);
revoke all on private.app_settings from anon, authenticated;


create or replace function public.tg_notify_new_student()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_url    text;
  v_secret text;
begin
  select value into v_url    from private.app_settings where key = 'telegram_event_url';
  select value into v_secret from private.app_settings where key = 'telegram_event_secret';

  if v_url is null or v_secret is null then
    return new; -- not configured; nothing to do
  end if;

  -- Asynchronous: queues the request and returns. It does not wait for the app
  -- and cannot be slowed down by it.
  perform net.http_post(
    url     := v_url,
    body    := jsonb_build_object(
                 'type',   'new_student',
                 'record', jsonb_build_object(
                             'id',    new.id,
                             'name',  new.name,
                             'email', new.email
                           )
               ),
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || v_secret
               )
  );

  return new;
exception
  -- A notification is never worth failing a signup for.
  when others then
    return new;
end;
$fn$;

drop trigger if exists trg_notify_new_student on public.profiles;
create trigger trg_notify_new_student
  after insert on public.profiles
  for each row execute function public.tg_notify_new_student();


-- ============================================================
-- CONFIGURE — edit these two, then run them.
-- ============================================================
-- Point at whichever host is serving the app, and use the SAME secret that is
-- set as TELEGRAM_EVENT_SECRET in that deployment's environment.
--
--   insert into private.app_settings (key, value) values
--     ('telegram_event_url',    'https://mockonline.uz/api/telegram/event'),
--     ('telegram_event_secret', '<TELEGRAM_EVENT_SECRET>')
--   on conflict (key) do update set value = excluded.value;
--
-- ============================================================
-- VERIFY
-- ============================================================
-- 1. Settings are in place:
--      select key, left(value, 12) || '…' from private.app_settings;
--
-- 2. The trigger fires and queues a request (rolled back, so no real account):
--      begin;
--        insert into auth.users (id, email) values (gen_random_uuid(), 'x@example.com');
--      rollback;
--    -- then, since pg_net queues outside the transaction:
--      select id, status_code, error_msg, created
--      from net._http_response order by created desc limit 5;
--
-- 3. The endpoint rejects a wrong secret:
--      curl -i -X POST https://<host>/api/telegram/event \
--        -H 'Authorization: Bearer wrong' -d '{}'
--    -> 404
-- ============================================================
