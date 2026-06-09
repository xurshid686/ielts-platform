-- ============================================================
-- IELTS Platform — 0013: store submitted answers for review
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to re-run.
-- ============================================================
-- Adds the user's submitted answers to each result so they can REOPEN a
-- finished test and see, question by question, what they put vs. the correct
-- answer. The answer key already lives on `tests.answer_key`; we only need to
-- remember what the student typed.
--
-- Shape: { "1": "terminal", "2": "FALSE", ... }  (question number -> answer)
-- NULL for legacy results saved before this migration (or keyless manual saves).

alter table public.results
  add column if not exists answers jsonb;

-- ============================================================
-- DONE. No backfill possible (old answers weren't stored); existing results
-- simply show "answers weren't recorded for this attempt" on the review page.
-- ============================================================
