-- 0063 — AI writing checks (Axiom) (2026-11-14)
--
-- One row per AI check of a student's writing, for two features that share one
-- engine (src/lib/writing-ai.ts):
--   * PRACTICE: a premium student checks a submitted practice attempt, 10 checks
--     per calendar month. A Full test (Task 1 + Task 2) is ONE check; a lone
--     Task 1 or Task 2 attempt is one check each.
--   * MOCK: the owner runs a check on a submitted mock Writing. It is a private
--     draft for the owner; it never counts against a student's quota, and the
--     student only ever sees it once the attempt is released AND the owner has
--     switched `show_to_student` on.
--
-- Additive and idempotent: it creates one table and one function and touches
-- nothing that exists, so there is no deploy-order hazard. Nothing is added to
-- mock_attempts on purpose — the student loaders select explicit column lists
-- from it, and a draft kept elsewhere cannot leak through them.
--
-- ACCESS: RLS on, NO policies and NO grants for anon/authenticated — the same
-- stance as the mock tables (0050) and writing practice (0057). The service role
-- is the only door; src/lib/writing-ai.ts takes the user id from the verified
-- session and scopes every student operation to it.
--
-- Verify after applying (scripts/check-0063.mjs): an ANON key is refused on the
-- table and on the function.

create table if not exists public.writing_ai_checks (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('practice', 'mock')),
  -- The record outlives the account, like the attempts it points at.
  user_id uuid references auth.users(id) on delete set null,
  practice_attempt_id uuid references public.writing_practice_attempts(id) on delete cascade,
  mock_attempt_id uuid references public.mock_attempts(id) on delete cascade,
  -- 'YYYY-MM' in the STUDENT'S timezone (profiles.timezone, like the streak).
  month text not null check (month ~ '^[0-9]{4}-[0-9]{2}$'),
  status text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  -- One entry per task: {task, axiomId, overall, bands{…}, feedback{…}}.
  results jsonb,
  -- Mock only: may the student see Axiom's comments after release? Never the numbers.
  show_to_student boolean not null default false,
  error text,
  -- The owner's Telegram copy: stamped when it was sent, or why it was not.
  telegram_sent_at timestamptz,
  telegram_error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  constraint writing_ai_checks_one_target check (
    (source = 'practice' and practice_attempt_id is not null and mock_attempt_id is null)
    or (source = 'mock' and mock_attempt_id is not null and practice_attempt_id is null)
  )
);

-- One live check per practice attempt (a failed one may be retried). This is the
-- backstop for the function below; the function's lock is what prevents the race.
create unique index if not exists writing_ai_checks_practice_once
  on public.writing_ai_checks (practice_attempt_id)
  where practice_attempt_id is not null and status <> 'failed';

-- The monthly count: a student's live practice checks in a month.
create index if not exists writing_ai_checks_quota_idx
  on public.writing_ai_checks (user_id, month)
  where source = 'practice' and status in ('pending', 'done');

-- The owner's attempt page: the checks for one mock attempt, newest first.
create index if not exists writing_ai_checks_mock_idx
  on public.writing_ai_checks (mock_attempt_id, created_at desc)
  where mock_attempt_id is not null;

alter table public.writing_ai_checks enable row level security;
revoke all on public.writing_ai_checks from anon, authenticated;

-- Reserve one check, atomically. A per-student advisory lock serialises the
-- count-and-insert, so a double click or two tabs cannot take an 11th check.
--
--   ok = true   -> check_id is a fresh 'pending' row; used is the count INCLUDING it
--   ok = false  -> reason is 'quota' (limit reached) or 'already' (this attempt
--                  already has a live check; check_id points at it)
--
-- A pending row older than 3 minutes is treated as dead (the request was cut off
-- before it could finish) and marked failed first, so a crash cannot burn a check.
create or replace function public.reserve_writing_check(
  p_user uuid,
  p_attempt uuid,
  p_month text,
  p_limit int
)
returns table (ok boolean, reason text, check_id uuid, used int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing uuid;
  v_used int;
  v_new uuid;
begin
  perform pg_advisory_xact_lock(hashtext('writing_ai:' || p_user::text));

  update public.writing_ai_checks
     set status = 'failed', error = 'timed out', finished_at = now()
   where user_id = p_user
     and status = 'pending'
     and created_at < now() - interval '3 minutes';

  select c.id into v_existing
    from public.writing_ai_checks c
   where c.practice_attempt_id = p_attempt and c.status <> 'failed'
   limit 1;
  if v_existing is not null then
    return query select false, 'already'::text, v_existing, 0;
    return;
  end if;

  select count(*)::int into v_used
    from public.writing_ai_checks c
   where c.user_id = p_user and c.month = p_month
     and c.source = 'practice' and c.status in ('pending', 'done');
  if v_used >= p_limit then
    return query select false, 'quota'::text, null::uuid, v_used;
    return;
  end if;

  insert into public.writing_ai_checks (source, user_id, practice_attempt_id, month)
  values ('practice', p_user, p_attempt, p_month)
  returning id into v_new;

  return query select true, null::text, v_new, v_used + 1;
end;
$$;

revoke all on function public.reserve_writing_check(uuid, uuid, text, int) from public, anon, authenticated;
grant execute on function public.reserve_writing_check(uuid, uuid, text, int) to service_role;

comment on table public.writing_ai_checks is
  'AI (Axiom) checks of practice and mock writing (0063). Service-role only; see src/lib/writing-ai.ts.';
