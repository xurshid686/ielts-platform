-- ============================================================
-- Public (no-login) tests
-- ------------------------------------------------------------
-- Adds an opt-in `is_public` flag. A public test can be taken by
-- anonymous visitors via /practice/[id] (served through the
-- service-role admin client, so no RLS change is required — the
-- public route filters on is_public = true itself). Everything
-- else stays authenticated-only.
-- ============================================================

alter table public.tests
  add column if not exists is_public boolean not null default false;

comment on column public.tests.is_public is
  'When true, this test is served without login via /practice/[id] '
  '(sanitized: answer key/explanations stripped, graded server-side, result not saved).';
