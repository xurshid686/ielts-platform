-- ============================================================
-- IELTS Platform — Phase 1 schema
-- Run this in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to re-run (idempotent where practical).
-- ============================================================

-- Allow forward references inside function bodies while this script runs.
set check_function_bodies = off;

-- ============================================================
-- PROFILES (mirrors auth.users; never stores passwords)
-- ============================================================
create table if not exists public.profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  name               text,
  email              text,
  avatar_url         text,
  role               text not null default 'student' check (role in ('student','admin')),
  streak             int  not null default 0,
  longest_streak     int  not null default 0,
  last_activity_date date,
  xp                 int  not null default 0,
  created_at         timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Helper used by RLS policies across every table (defined after profiles exists).
create or replace function public.is_admin(uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = uid and role = 'admin'
  );
$$;

drop policy if exists "profiles_select_self_or_admin" on public.profiles;
create policy "profiles_select_self_or_admin" on public.profiles
  for select using (auth.uid() = id or public.is_admin(auth.uid()));

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self" on public.profiles
  for insert with check (auth.uid() = id);

-- Auto-create a profile whenever a new auth user appears
-- (covers BOTH email/password signups AND Google OAuth first login).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1)
    ),
    new.email,
    coalesce(
      new.raw_user_meta_data->>'avatar_url',
      new.raw_user_meta_data->>'picture'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- TESTS (metadata only; HTML lives in Storage)
-- ============================================================
create table if not exists public.tests (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  skill       text not null check (skill in ('reading','listening')),
  level       text,
  passage     smallint check (passage between 1 and 3),  -- reading only
  file_url    text not null,
  file_path   text not null,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

alter table public.tests enable row level security;

drop policy if exists "tests_select_authenticated" on public.tests;
create policy "tests_select_authenticated" on public.tests
  for select to authenticated using (true);

drop policy if exists "tests_admin_all" on public.tests;
create policy "tests_admin_all" on public.tests
  for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- ============================================================
-- RESULTS
-- ============================================================
create table if not exists public.results (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  test_id      uuid references public.tests(id) on delete set null,
  skill        text not null check (skill in ('reading','listening','writing','speaking')),
  raw          int,
  total        int,
  band         numeric(3,1),
  submitted_at timestamptz not null default now()
);

alter table public.results enable row level security;
create index if not exists results_user_idx on public.results(user_id, submitted_at desc);

drop policy if exists "results_select_owner_or_admin" on public.results;
create policy "results_select_owner_or_admin" on public.results
  for select using (auth.uid() = user_id or public.is_admin(auth.uid()));

drop policy if exists "results_insert_owner" on public.results;
create policy "results_insert_owner" on public.results
  for insert with check (auth.uid() = user_id);

-- ============================================================
-- WRITING SUBMISSIONS (Phase 2)
-- ============================================================
create table if not exists public.writing_submissions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  task_type  text not null check (task_type in ('task1','task2')),
  prompt     text,
  content    text,
  score      numeric(3,1),
  feedback   jsonb,
  status     text not null default 'draft' check (status in ('draft','submitted')),
  created_at timestamptz not null default now()
);

alter table public.writing_submissions enable row level security;

drop policy if exists "writing_owner_select" on public.writing_submissions;
create policy "writing_owner_select" on public.writing_submissions
  for select using (auth.uid() = user_id or public.is_admin(auth.uid()));

drop policy if exists "writing_owner_cud" on public.writing_submissions;
create policy "writing_owner_cud" on public.writing_submissions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- SPEAKING SUBMISSIONS (Phase 2)
-- ============================================================
create table if not exists public.speaking_submissions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  prompt     text,
  audio_url  text,
  audio_path text,
  score      numeric(3,1),
  feedback   jsonb,
  created_at timestamptz not null default now()
);

alter table public.speaking_submissions enable row level security;

drop policy if exists "speaking_owner_select" on public.speaking_submissions;
create policy "speaking_owner_select" on public.speaking_submissions
  for select using (auth.uid() = user_id or public.is_admin(auth.uid()));

drop policy if exists "speaking_owner_cud" on public.speaking_submissions;
create policy "speaking_owner_cud" on public.speaking_submissions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- STREAK / XP engine  (single trusted place for the logic)
-- Call AFTER any activity. Increments streak at most once/day,
-- awards XP every call, resets streak if a day was missed.
-- ============================================================
create or replace function public.record_activity(p_xp int default 10)
returns table (streak int, longest_streak int, xp int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last    date;
  v_streak  int;
  v_longest int;
  v_today   date := (now() at time zone 'utc')::date;
begin
  select p.last_activity_date, p.streak, p.longest_streak
    into v_last, v_streak, v_longest
  from public.profiles p
  where p.id = auth.uid()
  for update;

  if v_last is null or v_last < v_today - 1 then
    v_streak := 1;                 -- first ever, or a day was missed
  elsif v_last = v_today - 1 then
    v_streak := v_streak + 1;      -- consecutive day
  end if;                          -- v_last = v_today -> unchanged

  v_longest := greatest(coalesce(v_longest, 0), v_streak);

  update public.profiles p
     set streak = v_streak,
         longest_streak = v_longest,
         last_activity_date = v_today,
         xp = p.xp + p_xp
   where p.id = auth.uid();

  return query
    select v_streak, v_longest, (select p.xp from public.profiles p where p.id = auth.uid());
end;
$$;

-- ============================================================
-- STORAGE BUCKETS + POLICIES
-- 'tests'    : public read, admin-only write (HTML test files)
-- 'speaking' : private (Phase 2 audio)
-- ============================================================
insert into storage.buckets (id, name, public)
values ('tests', 'tests', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('speaking', 'speaking', false)
on conflict (id) do nothing;

drop policy if exists "tests_public_read" on storage.objects;
create policy "tests_public_read" on storage.objects
  for select using (bucket_id = 'tests');

drop policy if exists "tests_admin_insert" on storage.objects;
create policy "tests_admin_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'tests' and public.is_admin(auth.uid()));

drop policy if exists "tests_admin_update" on storage.objects;
create policy "tests_admin_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'tests' and public.is_admin(auth.uid()));

drop policy if exists "tests_admin_delete" on storage.objects;
create policy "tests_admin_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'tests' and public.is_admin(auth.uid()));

-- Speaking bucket: owner-scoped (path must start with the user's id)
drop policy if exists "speaking_owner_rw" on storage.objects;
create policy "speaking_owner_rw" on storage.objects
  for all to authenticated
  using (bucket_id = 'speaking' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'speaking' and (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================
-- DONE. Next: make yourself an admin AFTER you sign up once:
--   update public.profiles set role = 'admin' where email = 'YOUR_EMAIL';
-- ============================================================
