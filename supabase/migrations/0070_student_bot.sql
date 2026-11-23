-- 0070 — the STUDENT Telegram bot (owner, 2026-11-23): a site account links its
-- Telegram chat and gets one recommended test a day. ADDITIVE.
--
-- Mirrors 0066's teacher_bot_links / teacher_link_codes. A separate pair on
-- purpose: a different bot (one webhook per bot), different audience, and the
-- daily opt-in lives on the link row.

create table if not exists public.student_bot_links (
  user_id uuid primary key references auth.users(id) on delete cascade,
  chat_id bigint not null unique,
  daily_on boolean not null default true,
  -- Local (Asia/Tashkent) day of the last daily push; makes a double cron run send nothing twice.
  last_daily date,
  linked_at timestamptz not null default now()
);

create table if not exists public.student_link_codes (
  code text primary key check (code ~ '^[A-Za-z0-9]{12}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists student_link_codes_user_idx on public.student_link_codes (user_id);

alter table public.student_bot_links enable row level security;
alter table public.student_link_codes enable row level security;
revoke all on public.student_bot_links from anon, authenticated;
revoke all on public.student_link_codes from anon, authenticated;
