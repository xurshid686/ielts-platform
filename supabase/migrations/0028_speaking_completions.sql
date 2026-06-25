-- ============================================================
-- IELTS Platform — 0028: Per-student "completed" marks for speaking topics
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to re-run.
-- ============================================================
-- Lets each student mark a speaking practice topic as completed. One row per
-- (student, topic). Students can only see and change their own marks.

create table if not exists public.speaking_completions (
  user_id      uuid not null references auth.users(id) on delete cascade,
  question_id  uuid not null references public.speaking_questions(id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (user_id, question_id)
);

alter table public.speaking_completions enable row level security;

drop policy if exists "speaking_completions_select_own" on public.speaking_completions;
create policy "speaking_completions_select_own"
  on public.speaking_completions for select
  to authenticated using (auth.uid() = user_id);

drop policy if exists "speaking_completions_insert_own" on public.speaking_completions;
create policy "speaking_completions_insert_own"
  on public.speaking_completions for insert
  to authenticated with check (auth.uid() = user_id);

drop policy if exists "speaking_completions_delete_own" on public.speaking_completions;
create policy "speaking_completions_delete_own"
  on public.speaking_completions for delete
  to authenticated using (auth.uid() = user_id);
-- ============================================================
