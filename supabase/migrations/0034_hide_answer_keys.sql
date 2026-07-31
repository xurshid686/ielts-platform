-- ============================================================
-- IELTS Platform — 0034: the answer key stops reaching the browser
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to re-run.
-- ============================================================
--
--  *** DEPLOY THE CODE FIRST. THIS MIGRATION IS NOT BACKWARD COMPATIBLE. ***
--
-- This revokes column-level SELECT, which breaks `select("*")` on `tests` and
-- any read of `answer_key` from a user session. The code that stopped doing
-- both of those things ships in the same change set as this file.
--
-- Applying this while the OLD code is still live takes the site down: the
-- test-detail page's select fails, the page calls notFound(), and every
-- /reading/[id] and /listening/[id] URL returns 404. That is exactly what
-- happened once — the migration was applied to production before the branch
-- carrying the code was deployed.
--
-- Correct order:
--   1. merge + deploy the application code
--   2. confirm the deployment is live
--   3. run this migration
--
-- To roll back in a hurry (restores service, reopens the leak until the code
-- is deployed):
--   grant select on public.tests to authenticated;
--   grant select on public.tests to anon;
--   drop policy if exists "tests_select_anon_catalogue" on public.tests;
--
-- Migration 0002 deliberately left `answer_key` readable by authenticated
-- users, reasoning that the CDI HTML shipped the same key inline anyway, so
-- server-grading only needed to stop fabricated SCORES — and it noted the fix:
-- "To hide answers later: strip the key from the served HTML + private bucket."
--
-- That is what this migration completes. /api/test-html now sanitizes every
-- keyed test on the way out (correctAnswers / acceptableAnswers / explanations
-- / evidence are blanked), so the inline copy is gone. This closes the other
-- half: the column itself.
--
-- After this, `answer_key` is readable ONLY with the service-role key, which
-- lives on the server. The three places that legitimately need it all run
-- server-side and use createAdminClient():
--   * /api/test-html/[id]      — decides whether the file can be sanitized
--   * saveResult()             — grades the submission
--   * /review/[resultId]       — renders the key for an attempt already made
--
-- NOTE: this is a column-level GRANT, not an RLS policy. RLS filters ROWS;
-- it cannot hide a column. Any `select("*")` on `tests` from a user session
-- will now fail — callers must name their columns (all of them were updated).

-- ------------------------------------------------------------
-- Column-level privileges for the two client-facing roles.
-- ------------------------------------------------------------
-- Revoking at table level first is required: a table-wide SELECT grant
-- outranks the absence of a column grant.
revoke select on public.tests from authenticated;
revoke select on public.tests from anon;

-- Everything EXCEPT answer_key, file_path and file_url. The two file columns
-- are withheld for the same reason the storage bucket is private: the HTML is
-- only ever served through the gated route.
grant select (
  id,
  title,
  skill,
  kind,
  tier,
  question_types,
  times_done,
  difficulty,
  level,
  track,
  passage,
  total,
  created_by,
  created_at
) on public.tests to authenticated;

-- `anon` gets the same catalogue columns. Browsing is public (the paywall is at
-- launch, not at discovery); the RLS policy below is what actually opens it.
grant select (
  id,
  title,
  skill,
  kind,
  tier,
  question_types,
  times_done,
  difficulty,
  level,
  track,
  passage,
  total,
  created_by,
  created_at
) on public.tests to anon;

-- ------------------------------------------------------------
-- RLS: let anonymous visitors read the catalogue.
-- ------------------------------------------------------------
-- Row visibility is unchanged for signed-in users. Anonymous visitors may see
-- the regular-track catalogue only — Pre-IELTS / Intro material stays hidden,
-- matching canAccessTrack() on the server.
drop policy if exists "tests_select_anon_catalogue" on public.tests;
create policy "tests_select_anon_catalogue" on public.tests
  for select to anon
  using (coalesce(track, 'regular') = 'regular');

-- ------------------------------------------------------------
-- Verification (run these after applying)
-- ------------------------------------------------------------
-- Should return zero rows — nothing may grant answer_key to a client role:
--   select grantee, privilege_type, column_name
--     from information_schema.column_privileges
--    where table_name = 'tests'
--      and column_name in ('answer_key','file_path','file_url')
--      and grantee in ('anon','authenticated');
--
-- Tests that cannot yet be served sanitized (they still score in-page and so
-- still ship their own answers). Backfill these, then re-check:
--   select id, title, skill from public.tests
--    where answer_key is null or answer_key = '{}'::jsonb;
