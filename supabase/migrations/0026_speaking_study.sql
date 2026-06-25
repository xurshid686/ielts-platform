-- ============================================================
-- IELTS Platform — 0026: Cached AI practice material per speaking topic
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to re-run.
-- ============================================================
-- Each topic in the question bank can have AI-generated practice material
-- (ideas, topic vocabulary, natural sample answers). It is generated once on
-- first view and cached here, shared for all users. Shape (jsonb):
--   { "ideas": string[],
--     "vocabulary": [{ "term","meaning","example" }],
--     "samples": [{ "prompt","answer" }] }

alter table public.speaking_questions
  add column if not exists study jsonb;
-- ============================================================
