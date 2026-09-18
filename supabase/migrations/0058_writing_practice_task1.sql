-- 0058 — Writing practice: Task 1 and Full tests (2026-09-18)
--
-- /writing grows from one menu (Task 2) to three: Task 1 · Task 2 · Full test.
--
-- - A Task 1 question is a topic sentence plus a PICTURE (a chart, map or
--   process), uploaded by the owner from /admin/writing-practice. The picture
--   lives in the private `writing-practice` bucket and is only ever served
--   through a short-lived signed URL.
-- - A Full test is not a question of its own: the student picks a Task 1 and the
--   server adds a random published Task 2 they have not finished yet (owner's
--   choice, 2026-09-18). The pair is SNAPSHOTTED on the attempt, so both halves
--   of one sitting live in one row.
--
-- Same rules as 0057: never marked, advisory clock, service-role only.
--
-- Additive and backward compatible. Every existing question becomes task = 2
-- and every existing attempt kind = 'task2' by default. The one thing the
-- OLD code does not know about is `task`: it lists every PUBLISHED row, so a
-- Task 1 question must stay unpublished until the new code is live.

-- 1. ------------------------------------------------------------ questions
alter table public.writing_practice
  add column if not exists task smallint not null default 2,
  add column if not exists image_path text,
  add column if not exists chart text;

alter table public.writing_practice drop constraint if exists writing_practice_task_check;
alter table public.writing_practice
  add constraint writing_practice_task_check check (task in (1, 2));

-- Task 1 kinds. Mirrors CHARTS in src/lib/writing-practice-topics.ts.
alter table public.writing_practice drop constraint if exists writing_practice_chart_check;
alter table public.writing_practice
  add constraint writing_practice_chart_check check (chart is null or chart in (
    'pie', 'bar', 'line', 'table', 'map', 'process', 'mixed'
  ));

-- A Task 1 has no essay topic; a Task 2 has no picture. The 0057 topic-list
-- check stays as it is (a CHECK passes on null).
alter table public.writing_practice alter column topic drop not null;
alter table public.writing_practice drop constraint if exists writing_practice_shape_check;
alter table public.writing_practice
  add constraint writing_practice_shape_check check (
    (task = 2 and topic is not null)
    or (task = 1 and image_path is not null and chart is not null)
  );

drop index if exists public.writing_practice_rank_idx;
create index if not exists writing_practice_task_rank_idx
  on public.writing_practice (task, appearances desc, created_at) where published;

-- 2. ------------------------------------------------------------- attempts
alter table public.writing_practice_attempts
  add column if not exists kind text not null default 'task2',
  -- Snapshot of the Task 1 picture's storage path (task1 and full).
  add column if not exists image_path text,
  -- The Task 2 half of a Full test. practice_id / prompt / answer hold Task 1.
  add column if not exists practice2_id uuid references public.writing_practice(id) on delete restrict,
  add column if not exists prompt2 text,
  add column if not exists topic2 text,
  add column if not exists answer2 text not null default '',
  add column if not exists word_count2 int not null default 0;

alter table public.writing_practice_attempts drop constraint if exists writing_practice_attempts_kind_check;
alter table public.writing_practice_attempts
  add constraint writing_practice_attempts_kind_check check (kind in ('task1', 'task2', 'full'));

alter table public.writing_practice_attempts drop constraint if exists writing_practice_attempts_wc2_check;
alter table public.writing_practice_attempts
  add constraint writing_practice_attempts_wc2_check check (word_count2 >= 0);

alter table public.writing_practice_attempts drop constraint if exists writing_practice_attempts_full_check;
alter table public.writing_practice_attempts
  add constraint writing_practice_attempts_full_check check (
    kind <> 'full' or (practice2_id is not null and prompt2 is not null)
  );

alter table public.writing_practice_attempts alter column topic drop not null;

-- Resuming is now per (question, kind): a Task 1 draft and a Full draft on the
-- same chart are different sittings.
drop index if exists public.writing_practice_attempts_open_idx;
create index if not exists writing_practice_attempts_open_kind_idx
  on public.writing_practice_attempts (user_id, practice_id, kind)
  where submitted_at is null;

-- 3. ---------------------------------------------------- the picture bucket
insert into storage.buckets (id, name, public)
values ('writing-practice', 'writing-practice', false)
on conflict (id) do nothing;

comment on table public.writing_practice is
  'IELTS Writing practice questions: task 2 (0057) and task 1 with a picture (0058). Service-role only; see src/lib/writing-practice.ts.';

-- ROLLBACK (only while no task1/full attempt and no task 1 question exist):
--   delete from public.writing_practice where task = 1;
--   alter table public.writing_practice_attempts drop column kind, drop column image_path,
--     drop column practice2_id, drop column prompt2, drop column topic2,
--     drop column answer2, drop column word_count2;
--   alter table public.writing_practice drop constraint writing_practice_shape_check,
--     drop column task, drop column image_path, drop column chart;
--   alter table public.writing_practice alter column topic set not null;
--   delete from storage.buckets where id = 'writing-practice';  -- after emptying it
