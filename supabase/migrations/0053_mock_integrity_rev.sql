-- ============================================================
-- IELTS Platform — 0053: compare-and-set revision for mock integrity
-- Safe to re-run. ADDITIVE — safe before the deploy.
-- ============================================================
-- mock_attempts.integrity (0052) is a jsonb record updated read-modify-write
-- by several writers at once: the section page recording a reload, the
-- /api/mock-events route, and a second tab. The 0052 E2E run lost a
-- "second tab" event that way — two writers read the same record and the later
-- write erased the earlier one.
--
-- integrity_rev turns every integrity write into compare-and-set: update ...
-- where integrity_rev = <read>, bump it, and re-read + re-apply on a miss.
-- ============================================================

alter table public.mock_attempts
  add column if not exists integrity_rev int not null default 0;

-- ROLLBACK: alter table public.mock_attempts drop column if exists integrity_rev;
