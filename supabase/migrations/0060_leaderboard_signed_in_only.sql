-- ============================================================
-- IELTS Platform — 0060: the leaderboards are for signed-in students only
-- Apply with: node scripts/apply-migration.mjs supabase/migrations/0060_leaderboard_signed_in_only.sql
-- Safe to re-run. Backward compatible: every reader in the app
-- (/leaderboard, /dashboard) already runs with a signed-in session.
-- ============================================================
-- 0016/0020 granted the three views to `authenticated`, but Supabase's default
-- privileges on the public schema also hand SELECT to `anon`, so anybody
-- holding the site's public anon key could list every ranked student's full
-- name, Google avatar URL and user id without an account. Owner decision
-- (2026-11-10): signed-in only.
--
-- Rollback:
--   grant select on public.leaderboard_global, public.leaderboard_weekly,
--     public.leaderboard_monthly to anon;

revoke all on public.leaderboard_global  from anon;
revoke all on public.leaderboard_weekly  from anon;
revoke all on public.leaderboard_monthly from anon;

grant select on public.leaderboard_global  to authenticated;
grant select on public.leaderboard_weekly  to authenticated;
grant select on public.leaderboard_monthly to authenticated;
