-- 0064: record whether a practice check's report was emailed to the student.
-- Additive and idempotent; the table stays service-role only (see 0063).
alter table public.writing_ai_checks
  add column if not exists email_sent_at timestamptz,
  add column if not exists email_error text;
