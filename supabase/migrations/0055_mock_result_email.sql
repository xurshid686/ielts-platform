-- 0055 — emailing a released mock result (2026-09-16)
--
-- The student is emailed their result when the owner releases it, with the
-- results paper attached (src/lib/mock-email.ts). These columns are the record
-- of that: what was sent, where to, and why it failed if it did — so the panel
-- can show "emailed" or "email not sent" and offer Send again.
--
-- Additive and idempotent. No grants: the mock tables have none for anon or
-- authenticated (0050), and everything here is written by the server.

alter table public.mock_attempts
  add column if not exists result_email_sent_at timestamptz,
  add column if not exists result_email_to text,
  add column if not exists result_email_error text,
  add column if not exists receipt_email_sent_at timestamptz;

comment on column public.mock_attempts.result_email_sent_at is
  'When the released-result email was accepted by the provider; null = never sent.';
comment on column public.mock_attempts.result_email_to is
  'The address that result email went to (snapshot, survives account deletion).';
comment on column public.mock_attempts.result_email_error is
  'Why the last attempt failed, trimmed; cleared on a successful send.';
comment on column public.mock_attempts.receipt_email_sent_at is
  'When the "we have your mock" receipt was sent, after the student finished.';
