-- 0071 — texting a released mock result (2026-11-24)
--
-- When the owner releases a mock result, the student is also sent an SMS
-- (src/lib/mock-sms.ts, provider smsxabarnoma.uz) with the overall and section
-- bands and a link that downloads the answers PDF without signing in
-- (src/app/a/[code]/route.ts).
--
--  * profiles.phone — OPTIONAL (international students), Uzbek numbers only,
--    stored as 998XXXXXXXXX. User-owned like target_band: written by the user's
--    own client under profiles_update_self, readable only by self or an admin
--    (profiles_select_self_or_admin, 0001). Deleting the account deletes it.
--  * mock_attempts.result_sms_* — the record of the send, same shape as the
--    result_email_* columns (0055).
--  * mock_attempts.report_code — the short code in the SMS link. Unguessable
--    (6 base62 chars from crypto.randomBytes), expires, and only serves a
--    RELEASED attempt.
--
-- Additive and idempotent. No grants on mock_attempts (0050): the server writes it.

alter table public.profiles
  add column if not exists phone text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_phone_uz') then
    alter table public.profiles
      add constraint profiles_phone_uz check (phone is null or phone ~ '^998[0-9]{9}$');
  end if;
end $$;

comment on column public.profiles.phone is
  'Optional Uzbek mobile for SMS mock results, 998XXXXXXXXX; null = no SMS.';

alter table public.mock_attempts
  add column if not exists result_sms_to text,
  add column if not exists result_sms_id text,
  add column if not exists result_sms_sent_at timestamptz,
  add column if not exists result_sms_error text,
  add column if not exists report_code text,
  add column if not exists report_code_expires_at timestamptz;

create unique index if not exists mock_attempts_report_code
  on public.mock_attempts (report_code) where report_code is not null;

comment on column public.mock_attempts.result_sms_sent_at is
  'When the result SMS was accepted by the provider (or claimed in flight); null = not sent.';
comment on column public.mock_attempts.result_sms_to is
  'The number the result SMS went to (snapshot, survives account deletion).';
comment on column public.mock_attempts.result_sms_id is 'Provider message id, for GET /sms/:id.';
comment on column public.mock_attempts.result_sms_error is
  'Why the last SMS attempt failed, trimmed; cleared on a successful send.';
comment on column public.mock_attempts.report_code is
  'Code in https://mockonline.uz/a/<code>: signed-out download of the released answers PDF.';
comment on column public.mock_attempts.report_code_expires_at is 'After this the code link 404s.';
