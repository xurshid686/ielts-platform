-- ============================================================
-- IELTS Platform — 0002: server-side grading
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to re-run.
-- ============================================================
-- Stores each test's answer key so the SERVER grades submissions.
-- The iframe sends the user's answers; the platform computes the score
-- against this key. A fabricated score is no longer possible for any test
-- that has a key. (NULL key => legacy/un-extractable test, falls back to
-- the client-reported raw/total.)

alter table public.tests
  add column if not exists answer_key jsonb,   -- { "1": ["terminal"], "6": ["raincoat","a raincoat"], ... }
  add column if not exists total      int;     -- number of gradeable questions

-- answer_key is intentionally readable by authenticated users: the CDI HTML
-- already ships the same key inline to render its post-submit review. The point
-- of server grading is to stop fabricated SCORES, not to hide answers.
-- (To hide answers later: strip the key from the served HTML + private bucket.)

-- ============================================================
-- DONE. After running: `npm run backfill:keys` to populate keys for the
-- tests that were seeded before this migration.
-- ============================================================
