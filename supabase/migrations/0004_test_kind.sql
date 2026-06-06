-- ============================================================
-- IELTS Platform — 0004: full tests vs single passages/sections
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to re-run.
-- ============================================================
-- 'single' = one reading passage / one listening section (the existing tests).
-- 'full'   = a complete test. Reading full tests have passage = NULL.

alter table public.tests
  add column if not exists kind text not null default 'single'
    check (kind in ('single', 'full'));

create index if not exists tests_skill_kind_idx on public.tests(skill, kind);
-- ============================================================
