-- ============================================================
-- IELTS Platform — 0051: mock attempt snapshots + request consistency
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to re-run. ADDITIVE — safe before the deploy.
-- ============================================================
-- Follow-up to 0050 from a review of the admin panel (2026-09-15).
--
-- 1. SNAPSHOTS. An attempt already copied its paper ids and writing prompts,
--    but three things were still read from the LIVE mock or test row:
--      - the writing time   -> editing it moved the deadline of an exam underway
--      - the Task 1 image   -> replacing it showed a different chart beside an
--                              old essay
--      - the answer keys    -> correcting a key re-marked historical reviews
--    Each is now copied onto the attempt: time and image when the place is
--    granted, the key at the moment the section is graded. The app reads the
--    snapshot and falls back to the live row only for attempts made before
--    this migration (there were none in production).
--
-- 2. REQUEST CONSISTENCY. Creating a place and closing the student's pending
--    request were two separate writes, so a direct grant left the request
--    "waiting", and a failure between the writes left the two disagreeing.
--    An AFTER INSERT trigger on mock_attempts now resolves any pending request
--    for the same student + mock IN THE SAME TRANSACTION as the insert. It is a
--    trigger, not an admin RPC, so the service-role library (and therefore the
--    Telegram bot) keeps working — see 0050 on why RPCs are avoided here.
-- ============================================================

alter table public.mock_attempts
  add column if not exists writing_minutes          int,
  add column if not exists writing_task1_image_path text,
  add column if not exists listening_key            jsonb,
  add column if not exists reading_key              jsonb;

create or replace function public.resolve_mock_request_on_attempt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is not null then
    update mock_requests
       set status     = 'approved',
           decided_at = coalesce(decided_at, now()),
           decided_by = coalesce(decided_by, new.approved_by)
     where user_id = new.user_id
       and mock_id = new.mock_id
       and status  = 'pending';
  end if;
  return new;
end;
$$;

revoke all on function public.resolve_mock_request_on_attempt() from public, anon, authenticated;

drop trigger if exists mock_attempt_resolves_request on public.mock_attempts;
create trigger mock_attempt_resolves_request
  after insert on public.mock_attempts
  for each row execute function public.resolve_mock_request_on_attempt();

-- ============================================================
-- ROLLBACK:
--   drop trigger if exists mock_attempt_resolves_request on public.mock_attempts;
--   drop function if exists public.resolve_mock_request_on_attempt();
--   alter table public.mock_attempts drop column if exists writing_minutes,
--     drop column if exists writing_task1_image_path,
--     drop column if exists listening_key, drop column if exists reading_key;
-- ============================================================
