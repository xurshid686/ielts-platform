-- 0066 — Ultima plan: printable PDFs of reading tests, delivered by a teacher bot (2026-11-20)
--
--   * ultima_members:     who holds the Ultima plan, and until when.
--   * test_pdfs:          one built question-paper PDF per reading test. The file itself lives
--                         in the private R2 bucket under  papers/<test_id>.pdf ; this row is the
--                         pointer, plus the Telegram file_id once the bot has sent it, so the
--                         next send costs no upload.
--   * teacher_bot_links:  which Telegram chat belongs to which account (the teacher bot).
--   * teacher_link_codes: single-use, short-lived codes that bind a chat to an account.
--
-- Additive and idempotent: four new tables, nothing existing is touched, so there is no
-- deploy-order hazard (unlike 0034 / 0041). Apply any time; the site code that reads these
-- tables degrades to "no PDF button" while they are absent.
--
-- ACCESS: RLS on, NO policies and NO grants for anon/authenticated — the stance of 0050, 0057
-- and 0065. src/lib/ultima.ts (service role) is the only door, and it takes the user id from the
-- verified session or from a verified link code, never from the request.
--
-- Why a separate ultima_members table and not a column on profiles: a new profiles column would
-- have to be added to the 0023 privileged-field guard, or a student could write their own plan.
-- A table nobody but the service role can touch has no such hazard.
--
-- Verify after applying (scripts/check-0066.mjs): an ANON key is refused on all four.

create table if not exists public.ultima_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  ultima_until timestamptz not null,
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users(id) on delete set null
);

create table if not exists public.test_pdfs (
  test_id uuid primary key references public.tests(id) on delete cascade,
  r2_key text not null check (r2_key like 'papers/%'),
  bytes integer not null check (bytes > 0),
  pages smallint not null check (pages > 0),
  -- Telegram file_id is specific to the bot that uploaded it. Null until first sent.
  tg_file_id text,
  built_at timestamptz not null default now()
);

create table if not exists public.teacher_bot_links (
  user_id uuid primary key references auth.users(id) on delete cascade,
  chat_id bigint not null unique,
  linked_at timestamptz not null default now()
);

create table if not exists public.teacher_link_codes (
  code text primary key check (code ~ '^[A-Za-z0-9]{12}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists teacher_link_codes_user_idx on public.teacher_link_codes (user_id);

alter table public.ultima_members enable row level security;
alter table public.test_pdfs enable row level security;
alter table public.teacher_bot_links enable row level security;
alter table public.teacher_link_codes enable row level security;

-- New tables in `public` inherit Supabase's default grants; take them away explicitly so
-- anon / authenticated can read nothing even with RLS misconfigured later.
revoke all on public.ultima_members from anon, authenticated;
revoke all on public.test_pdfs from anon, authenticated;
revoke all on public.teacher_bot_links from anon, authenticated;
revoke all on public.teacher_link_codes from anon, authenticated;
