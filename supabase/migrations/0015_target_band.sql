-- ============================================================
-- IELTS Platform — 0015: per-user target band (goal)
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to re-run.
-- ============================================================
-- A student's goal band (e.g. 7.0). The dashboard shows progress toward it and
-- which skills are still below target. This is a USER-OWNED preference, so it is
-- deliberately NOT in the privileged-column list guarded by migration 0014 —
-- users set it directly via profiles_update_self, like name/avatar.

alter table public.profiles
  add column if not exists target_band numeric(2,1)
  check (target_band is null or (target_band >= 1 and target_band <= 9));

-- ============================================================
-- DONE.
-- ============================================================
