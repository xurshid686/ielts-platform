-- ============================================================
-- IELTS Platform — 0030: assignments for My-students
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to re-run.
-- ============================================================
-- The teacher (admin) gives an assignment in any section to one or more
-- My-students, optionally with a due date, and tracks per-student status:
--   assigned -> in_progress -> submitted.
--   * reading/listening  -> a specific test (tests.id)
--   * speaking           -> a question from the bank, or a free-text prompt
--   * writing            -> a free-text prompt
-- Status auto-advances: 'in_progress' when the student opens it
-- (start_assignment), 'submitted' when their submission lands
-- (complete_assignments, called from the section submit flows).
-- ============================================================

set check_function_bodies = off;

-- 1. ------------------------------------------------ the assignment
create table if not exists public.assignments (
  id                    uuid primary key default gen_random_uuid(),
  created_by            uuid not null references auth.users(id) on delete cascade,
  skill                 text not null check (skill in ('reading','listening','writing','speaking')),
  test_id               uuid references public.tests(id) on delete cascade,
  speaking_question_id  uuid references public.speaking_questions(id) on delete cascade,
  writing_prompt        text,
  title                 text not null,
  due_date              date,
  created_at            timestamptz not null default now(),
  -- the correct reference must be present for the chosen section
  constraint assignment_ref_chk check (
    (skill in ('reading','listening') and test_id is not null and speaking_question_id is null)
    or (skill = 'speaking' and (speaking_question_id is not null or writing_prompt is not null) and test_id is null)
    or (skill = 'writing'  and writing_prompt is not null and test_id is null and speaking_question_id is null)
  )
);

-- 2. -------------------------------- per-student delivery + status
create table if not exists public.assignment_targets (
  id                      uuid primary key default gen_random_uuid(),
  assignment_id           uuid not null references public.assignments(id) on delete cascade,
  user_id                 uuid not null references auth.users(id) on delete cascade,
  status                  text not null default 'assigned'
                            check (status in ('assigned','in_progress','submitted')),
  result_id               uuid references public.results(id) on delete set null,
  speaking_submission_id  uuid references public.speaking_submissions(id) on delete set null,
  writing_submission_id   uuid references public.writing_submissions(id) on delete set null,
  started_at              timestamptz,
  submitted_at            timestamptz,
  unique (assignment_id, user_id)
);
create index if not exists assignment_targets_user_idx
  on public.assignment_targets (user_id, status);
create index if not exists assignment_targets_assignment_idx
  on public.assignment_targets (assignment_id);

-- 3. ------------------------------------------------ row-level security
alter table public.assignments        enable row level security;
alter table public.assignment_targets enable row level security;

-- Admins manage everything.
drop policy if exists assignments_admin_all on public.assignments;
create policy assignments_admin_all on public.assignments
  for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- A student may read an assignment that targets them.
drop policy if exists assignments_select_targeted on public.assignments;
create policy assignments_select_targeted on public.assignments
  for select to authenticated
  using (exists (
    select 1 from public.assignment_targets t
    where t.assignment_id = id and t.user_id = auth.uid()
  ));

drop policy if exists atargets_admin_all on public.assignment_targets;
create policy atargets_admin_all on public.assignment_targets
  for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- A student may read their own target rows.
drop policy if exists atargets_select_own on public.assignment_targets;
create policy atargets_select_own on public.assignment_targets
  for select to authenticated
  using (user_id = auth.uid());

-- Status transitions go through the SECURITY DEFINER RPCs below, so students
-- get no direct UPDATE policy (admins still can via atargets_admin_all).

-- 4. ------------- student opens an assignment -> in_progress
create or replace function public.start_assignment(p_assignment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.assignment_targets
     set status = 'in_progress',
         started_at = coalesce(started_at, now())
   where assignment_id = p_assignment_id
     and user_id = auth.uid()
     and status = 'assigned';
end;
$$;

grant execute on function public.start_assignment(uuid) to authenticated;

-- 5. ------------- a submission lands -> mark matching assignments submitted
--    Called from the section submit flows for the signed-in user. Matches on
--    skill (+ test_id for reading/listening) and safely no-ops when the user
--    has no matching assignment.
create or replace function public.complete_assignments(
  p_skill text,
  p_test_id uuid,
  p_result_id uuid,
  p_speaking_submission_id uuid,
  p_writing_submission_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.assignment_targets t
     set status = 'submitted',
         submitted_at = now(),
         result_id = coalesce(p_result_id, t.result_id),
         speaking_submission_id = coalesce(p_speaking_submission_id, t.speaking_submission_id),
         writing_submission_id  = coalesce(p_writing_submission_id, t.writing_submission_id)
    from public.assignments a
   where t.assignment_id = a.id
     and t.user_id = auth.uid()
     and t.status <> 'submitted'
     and a.skill = p_skill
     and (
       a.test_id = p_test_id
       or (p_test_id is null and a.skill in ('writing','speaking'))
     );
end;
$$;

grant execute on function public.complete_assignments(text, uuid, uuid, uuid, uuid) to authenticated;

-- ============================================================
-- DONE.
-- ============================================================
