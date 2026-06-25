-- ============================================================
-- IELTS Platform — 0027: "Send to teacher" student flag
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to re-run.
-- ============================================================
-- Admin-flagged students may send their recorded speaking answers to the
-- teacher (via the Telegram bot). Everyone can still record + replay locally.

alter table public.profiles
  add column if not exists can_send_to_teacher boolean not null default false;

-- To flag a student, run (replace the email):
--   update public.profiles set can_send_to_teacher = true
--   where email = 'student@example.com';
-- ============================================================
