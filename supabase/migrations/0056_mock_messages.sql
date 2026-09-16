-- 0056 — the message log behind the email status bar (2026-09-16)
--
-- 0055 put four stamps on mock_attempts, which answer "was the latest result
-- email accepted?" and nothing else: a retry overwrote the previous outcome, a
-- receipt had nowhere to record a failure, and "accepted by Resend" is not
-- "arrived in the inbox".
--
-- mock_messages is the LOG: one row per send attempt, so history survives a
-- retry, and `provider_id` (Resend's own email id) is what a webhook event uses
-- to find the row it is about. mock_attempts.result_email_status is a
-- denormalised copy of the latest RESULT message's status so the Results list
-- and its CSV need no join — written only by lib/mock-email.ts and the webhook.
--
-- Additive and idempotent. No grants: the mock tables have none for anon or
-- authenticated (0050), and everything here is written by the server.

create table if not exists public.mock_messages (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.mock_attempts(id) on delete cascade,
  mock_id uuid not null references public.mocks(id) on delete cascade,
  kind text not null check (kind in ('result', 'receipt')),
  to_email text not null,
  -- Resend's email id. Null until the send is accepted (and on a failure).
  provider_id text,
  status text not null default 'queued'
    check (status in ('queued', 'sent', 'delivered', 'delayed', 'bounced', 'complained', 'failed')),
  error text,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists mock_messages_mock_idx on public.mock_messages (mock_id, kind, status);
create index if not exists mock_messages_attempt_idx on public.mock_messages (attempt_id, created_at desc);
create index if not exists mock_messages_created_idx on public.mock_messages (created_at desc);
-- One row per provider id: a webhook event must never fan out to several rows.
create unique index if not exists mock_messages_provider_idx
  on public.mock_messages (provider_id) where provider_id is not null;

alter table public.mock_messages enable row level security;
revoke all on public.mock_messages from anon, authenticated;

alter table public.mock_attempts
  add column if not exists result_email_status text;

comment on table public.mock_messages is
  'Every result/receipt email sent for a mock attempt, with its delivery status from the Resend webhook.';
comment on column public.mock_messages.provider_id is
  'Resend email id; the key a webhook event is matched on.';
comment on column public.mock_messages.status is
  'queued -> sent -> delayed -> delivered; bounced/complained/failed are terminal and always win.';
comment on column public.mock_attempts.result_email_status is
  'Latest result message status, denormalised for the Results list. Written by lib/mock-email.ts and the webhook.';
