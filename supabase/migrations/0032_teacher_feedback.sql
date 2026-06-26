-- ============================================================
-- IELTS Platform — 0032: in-app teacher → student feedback
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to re-run.
-- ============================================================
-- The teacher (admin) sends written feedback to one of their My-students.
-- One-way (teacher -> student). The student reads it on /feedback and is
-- alerted via the existing notification bell. Feedback can optionally be
-- tied to an assignment for context, but is usually free-standing (e.g.
-- feedback on a speaking recording that arrived over Telegram).
-- ============================================================

set check_function_bodies = off;

-- 1. ------------------------------------------------ the feedback row
create table if not exists public.teacher_feedback (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references public.profiles(id) on delete cascade,
  author_id     uuid not null references auth.users(id) on delete cascade,
  body          text not null,
  assignment_id uuid references public.assignments(id) on delete set null,
  skill         text,  -- optional context label when not tied to an assignment
  title         text,  -- optional short subject, e.g. "Speaking — Hometown"
  read_at       timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists teacher_feedback_student_idx
  on public.teacher_feedback (student_id, created_at desc);

-- 2. ------------------------------------------------ row-level security
alter table public.teacher_feedback enable row level security;

-- Teacher (admin) reads + writes everything.
drop policy if exists feedback_admin_all on public.teacher_feedback;
create policy feedback_admin_all on public.teacher_feedback
  for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- A student reads their own feedback.
drop policy if exists feedback_select_own on public.teacher_feedback;
create policy feedback_select_own on public.teacher_feedback
  for select to authenticated
  using (auth.uid() = student_id);

-- A student may mark their own feedback read (mirrors notifications_update_own).
drop policy if exists feedback_update_own on public.teacher_feedback;
create policy feedback_update_own on public.teacher_feedback
  for update to authenticated
  using (auth.uid() = student_id)
  with check (auth.uid() = student_id);

-- No student INSERT policy: feedback is written only by the RPC below.

-- 3. ----------- admin-only sender (also drops a notification for the student)
create or replace function public.admin_send_feedback(
  p_student uuid,
  p_body text,
  p_assignment_id uuid,
  p_skill text,
  p_title text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only admins can send feedback' using errcode = '42501';
  end if;
  if coalesce(btrim(p_body), '') = '' then
    raise exception 'Feedback body is required' using errcode = '22023';
  end if;

  insert into public.teacher_feedback (student_id, author_id, body, assignment_id, skill, title)
  values (p_student, auth.uid(), btrim(p_body), p_assignment_id, nullif(btrim(p_skill), ''), nullif(btrim(p_title), ''))
  returning id into v_id;

  -- Light up the student's notification bell. notifications has no INSERT
  -- policy, but this function runs as the table owner (like build_weekly_report).
  insert into public.notifications (user_id, type, title, body, data)
  values (
    p_student,
    'teacher_feedback',
    'New feedback from your teacher',
    left(btrim(p_body), 140),
    jsonb_build_object('feedback_id', v_id)
  );

  return v_id;
end;
$$;

grant execute on function public.admin_send_feedback(uuid, text, uuid, text, text) to authenticated;

-- ============================================================
-- VERIFY (optional, as an admin):
--   select public.admin_send_feedback('<student-uuid>', 'Great work!', null, 'speaking', 'Hometown');
--   -- as a non-admin this must FAIL.
-- ============================================================
