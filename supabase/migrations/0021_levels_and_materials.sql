-- ============================================================
-- IELTS Platform — 0021: student levels (tracks) + materials library
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to re-run.
-- ============================================================
-- WHAT THIS ADDS
-- 1. profiles.level — each student is in exactly ONE track:
--      'regular'   (default — full IELTS, what every existing user is)
--      'pre_ielts' (foundation students)
--      'intro'     (IELTS introduction students)
--    Admins move students between levels as they progress.
-- 2. set_user_level() — admin-only, trusted setter (mirrors set_premium).
-- 3. level is added to the privileged-field guard so students can't
--    self-assign a level via the public REST API.
-- 4. materials — an admin-curated library of files/links, each tagged to a
--    level. Students see only their own level's materials (RLS); admins see
--    all. Files live in a private 'materials' storage bucket served via
--    short-lived signed URLs.
-- ============================================================

set check_function_bodies = off;

-- 1. -------------------------------------------------------- profile level
alter table public.profiles
  add column if not exists level text not null default 'regular';

-- (re-runnable) ensure the check constraint exists exactly once
alter table public.profiles drop constraint if exists profiles_level_check;
alter table public.profiles
  add constraint profiles_level_check
  check (level in ('regular', 'pre_ielts', 'intro'));

-- 2. ----------------------------------------------- admin-only level setter
create or replace function public.set_user_level(target_email text, new_level text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text;
  updated_email text;
begin
  if new_level not in ('regular', 'pre_ielts', 'intro') then
    raise exception 'Invalid level: %', new_level using errcode = '22023';
  end if;

  select role into caller_role from profiles where id = auth.uid();
  if caller_role is distinct from 'admin' then
    raise exception 'Only admins may set a student level.' using errcode = '42501';
  end if;

  update profiles
     set level = new_level
   where lower(email) = lower(trim(target_email))
   returning email into updated_email;

  if updated_email is null then
    raise exception 'No user found with that email.' using errcode = 'no_data_found';
  end if;

  return new_level;
end;
$$;

revoke all on function public.set_user_level(text, text) from public, anon;
grant execute on function public.set_user_level(text, text) to authenticated;

-- 3. ------------------------------------ block self-escalation of `level`
-- Extend the 0014 guard so the public REST roles can't change their level.
create or replace function public.protect_profile_privileged_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.role               is distinct from old.role
       or new.is_owner          is distinct from old.is_owner
       or new.xp                is distinct from old.xp
       or new.premium_until     is distinct from old.premium_until
       or new.streak            is distinct from old.streak
       or new.longest_streak    is distinct from old.longest_streak
       or new.last_activity_date is distinct from old.last_activity_date
       or new.level             is distinct from old.level
    then
      raise exception 'You may not modify privileged profile fields.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
-- trigger itself is unchanged (still bound from 0014); recreate defensively
drop trigger if exists trg_protect_profile_privileged on public.profiles;
create trigger trg_protect_profile_privileged
  before update on public.profiles
  for each row execute function public.protect_profile_privileged_fields();

-- 4. ------------------------------------------------------ materials table
create table if not exists public.materials (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,
  level       text not null check (level in ('pre_ielts', 'intro')),
  kind        text not null check (kind in ('file', 'link')),
  file_path   text,        -- storage path in the 'materials' bucket (kind='file')
  url         text,        -- external link (kind='link')
  sort        int  not null default 0,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists materials_level_idx on public.materials (level, sort, created_at desc);

alter table public.materials enable row level security;

-- Students read only their OWN level's materials; admins read everything.
drop policy if exists materials_select on public.materials;
create policy materials_select on public.materials
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.role = 'admin' or p.level = materials.level)
    )
  );

-- Only admins create / update / delete materials.
drop policy if exists materials_admin_write on public.materials;
create policy materials_admin_write on public.materials
  for all to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- 5. -------------------------------------------------- private storage bucket
insert into storage.buckets (id, name, public)
values ('materials', 'materials', false)
on conflict (id) do nothing;

-- Read an object only if a materials row points at it AND the viewer is an
-- admin or a student of that material's level. This lets the user's own
-- session mint a signed URL (no service-role key needed at runtime).
drop policy if exists "materials read by level" on storage.objects;
create policy "materials read by level" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'materials'
    and exists (
      select 1
      from public.materials m
      join public.profiles p on p.id = auth.uid()
      where m.file_path = storage.objects.name
        and (p.role = 'admin' or p.level = m.level)
    )
  );

-- Only admins may upload / overwrite / delete material files.
drop policy if exists "materials write by admin" on storage.objects;
create policy "materials write by admin" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'materials'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  )
  with check (
    bucket_id = 'materials'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- ============================================================
-- VERIFY (optional):
--   select level, count(*) from public.profiles group by level;
--   -- as a non-admin this must FAIL:
--   select public.set_user_level('someone@example.com', 'pre_ielts');
-- ============================================================
