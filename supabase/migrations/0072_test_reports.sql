-- 0072 — students report problems in a test ("Report a problem", owner 2026-11-24).
--
-- A bug button in the practice player's top bar (outside the CDI iframe) lets a
-- signed-in student flag a wrong key, a text mistake, a broken page or an audio
-- problem. The owner gets a Telegram push and works the list on /admin/reports;
-- marking one Fixed gives the student +50 XP and an in-app thank-you, once.
--
-- ADDITIVE. Nothing reads this table until the matching code ships.
-- Stance of 0050 / 0057 / 0069: RLS on, NO policies, NO grants for anon or
-- authenticated. src/lib/test-reports.ts (service role) is the only door.

create table if not exists public.test_reports (
  id          uuid primary key default gen_random_uuid(),
  test_id     uuid not null references public.tests(id) on delete cascade,
  -- set null, not cascade: a report about a real defect outlives the account.
  user_id     uuid references public.profiles(id) on delete set null,
  category    text not null
              check (category in ('wrong_answer', 'text_error', 'layout', 'audio', 'other')),
  question    text check (question is null or char_length(question) between 1 and 20),
  message     text not null check (char_length(message) between 5 and 1000),
  page_url    text check (page_url is null or char_length(page_url) <= 500),
  user_agent  text check (user_agent is null or char_length(user_agent) <= 400),
  status      text not null default 'open' check (status in ('open', 'fixed', 'dismissed')),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  rewarded    boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists test_reports_status_idx on public.test_reports (status, created_at desc);
create index if not exists test_reports_user_idx on public.test_reports (user_id, created_at desc);
create index if not exists test_reports_test_idx on public.test_reports (test_id);

alter table public.test_reports enable row level security;
revoke all on public.test_reports from anon, authenticated;
