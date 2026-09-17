-- 0057 — Writing Task 2 practice (2026-09-17)
--
-- A library of real IELTS Writing Task 2 questions (the @CDI_Report corpus,
-- 606 unique questions in 15 topics) that any logged-in student can sit on
-- their own: one question, the Cambridge layout the mock uses, an ADVISORY
-- 40-minute clock, a PDF of their essay, and the attempt kept on their account.
--
-- It is deliberately NOT the mock exam. No request/approve, no session window,
-- no fullscreen, no violations, nothing automatic at zero, and no band — a
-- practice attempt is never marked, so nothing here can move a number a student
-- is judged on.
--
-- Additive and idempotent: it creates two new tables and touches nothing that
-- exists. No deploy-order hazard.
--
-- ACCESS: RLS on, NO policies and NO grants for anon/authenticated — the same
-- stance the mock tables take (0050). src/lib/writing-practice.ts is the only
-- door, it runs under the service role, and it derives the user id from the
-- verified session and scopes every attempt operation to it. Those checks ARE
-- the security boundary here, because the service role bypasses RLS.
--
-- Verify after applying (should be 0 rows / permission denied with an anon key):
--   select count(*) from public.writing_practice;            -- service role: 0
--   -- with the ANON key over PostgREST:
--   -- GET /rest/v1/writing_practice  ->  42501 permission denied

create table if not exists public.writing_practice (
  id uuid primary key default gen_random_uuid(),
  -- The 15 ids in src/lib/writing-practice-topics.ts. Pinned here so a typo in
  -- an import script fails loudly instead of creating a sixteenth topic that
  -- the UI has no colour or label for.
  topic text not null check (topic in (
    'education', 'environment', 'health', 'technology', 'work-careers',
    'family-children', 'media-advertising', 'crime-justice', 'government-policy',
    'society-lifestyle', 'culture-traditions', 'economy-consumerism',
    'travel-tourism', 'transport-urban', 'globalisation'
  )),
  -- The question exactly as the corpus has it. The Cambridge wording around it
  -- ("You should spend about 40 minutes…") is built at DISPLAY time by
  -- lib/ielts/writing-prompt.ts, the same as the mock's prompts.
  prompt text not null check (length(btrim(prompt)) > 0),
  -- sha256 of the NFC-normalised, whitespace-collapsed prompt. The import key:
  -- re-running the importer updates by this, so nothing is ever duplicated.
  source_hash text not null unique,
  -- How often @CDI_Report saw this question. Orders the catalogue.
  appearances int not null default 1 check (appearances >= 0),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists writing_practice_topic_idx
  on public.writing_practice (topic) where published;
create index if not exists writing_practice_rank_idx
  on public.writing_practice (appearances desc, created_at) where published;

create table if not exists public.writing_practice_attempts (
  id uuid primary key default gen_random_uuid(),
  -- The record outlives the account, like mock_attempts.
  user_id uuid references auth.users(id) on delete set null,
  -- restrict, not cascade: a question is UNPUBLISHED, never deleted, so a
  -- student's history can never lose the thing it was written about.
  practice_id uuid not null references public.writing_practice(id) on delete restrict,
  -- SNAPSHOTS of what the student actually saw. Editing the question later must
  -- not rewrite anybody's history, and the PDF renders from these.
  prompt text not null,
  topic text not null,
  answer text not null default '',
  -- Counted on the SERVER, never taken from the browser.
  word_count int not null default 0 check (word_count >= 0),
  -- Compare-and-set: a stale autosave from a background tab is refused rather
  -- than overwriting newer work. Same idea as mock_attempts.integrity_rev (0053).
  revision int not null default 0,
  started_at timestamptz not null default now(),
  saved_at timestamptz,
  submitted_at timestamptz
);

-- The history list: a student's attempts, newest first.
create index if not exists writing_practice_attempts_user_idx
  on public.writing_practice_attempts (user_id, started_at desc);
-- Resuming: the one unsubmitted attempt a student has on a question.
create index if not exists writing_practice_attempts_open_idx
  on public.writing_practice_attempts (user_id, practice_id)
  where submitted_at is null;

alter table public.writing_practice enable row level security;
alter table public.writing_practice_attempts enable row level security;

-- No policies on purpose. With RLS enabled and none defined, anon and
-- authenticated can read nothing even if a future default grant appears.
revoke all on public.writing_practice from anon, authenticated;
revoke all on public.writing_practice_attempts from anon, authenticated;

comment on table public.writing_practice is
  'IELTS Writing Task 2 practice questions (0057). Service-role only; see src/lib/writing-practice.ts.';
comment on table public.writing_practice_attempts is
  'A student''s own Task 2 practice. Never marked, never scored, never in `results`.';
