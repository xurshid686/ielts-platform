-- 0059 — PDF → CDI conversion jobs (2026-09-20)
--
-- The owner submits a reading PDF on /admin/converter; a worker on the owner's
-- machine picks the job up, runs the converter in X:\CDI READING PROJECT\cdi,
-- and writes the built player back. The site never converts anything itself:
-- the pipeline needs Python, PyMuPDF, a real Chrome for the browser gate and a
-- desktop-only Gemini CLI, none of which exist on App Platform. This table and
-- one private bucket are the whole of the server's share.
--
-- Nothing here publishes. A job that passes every gate stops at `passed`, and a
-- separate, explicit action creates the `tests` row through the one shared path
-- (src/lib/tests/create.ts). A paper never reaches students without a click.
--
-- Additive and idempotent: one new table, one new bucket, nothing existing is
-- touched. No deploy-order hazard — the table can exist before the page does.
--
-- ACCESS: RLS on, NO policies and NO grants for anon/authenticated, the same
-- stance the mock (0050) and writing-practice (0057) tables take.
-- src/lib/converter.ts is the only door; it runs under the service role and its
-- callers gate with requireOwner(). Those checks ARE the security boundary,
-- because the service role bypasses RLS. The worker authenticates with the
-- service-role key too, which is why the bucket is private with no policies.
--
-- Verify after applying (with the ANON key over PostgREST, both should fail):
--   GET /rest/v1/conversion_jobs        ->  42501 permission denied
--   GET /storage/v1/object/conversions/ ->  not found / unauthorized

create table if not exists public.conversion_jobs (
  id                 uuid primary key default gen_random_uuid(),

  -- The --id given to convert.py. Also the folder name under tests/ on the
  -- owner's machine, so it must survive a round trip as a filename.
  test_id            text not null,
  title              text not null,

  -- Storage path in the private `conversions` bucket. Set on submit, and
  -- NULLED once the build succeeds: the PDF has done its job, and keeping one
  -- per paper would add about 1.5 GB a year for nothing.
  pdf_path           text,
  html_path          text,

  status             text not null default 'queued'
                     check (status in ('queued','running','passed','failed',
                                       'published','cancelled')),
  -- Which of the pipeline's steps is running, in words, for the page to show.
  stage              text,
  -- Tail of the worker's output. Kept on failure; that is the whole point.
  log                text,

  -- The --plan summary: passage count, titles, paragraph counts, question
  -- ranges. Shown BEFORE anything is spent so a misread paper is caught here.
  shape              jsonb,
  -- errata.json: questions where a derivation disagreed with the printed key.
  -- Empty array is the good case. The printed key always ships regardless.
  errata             jsonb,
  -- report.json: model cost, call count, consensus counts.
  report             jsonb,

  -- Set only by the publish action, never by the worker.
  published_test_id  uuid references public.tests(id) on delete set null,

  created_by         uuid not null references public.profiles(id) on delete cascade,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  -- When a worker took the job. Lets a crashed run be re-queued by age rather
  -- than sitting as 'running' forever.
  claimed_at         timestamptz
);

-- The worker's poll is "oldest queued job first", and the page lists recent
-- jobs newest first. Two small indexes rather than a scan.
create index if not exists conversion_jobs_queue_idx
  on public.conversion_jobs (status, created_at)
  where status in ('queued', 'running');

create index if not exists conversion_jobs_recent_idx
  on public.conversion_jobs (created_at desc);

alter table public.conversion_jobs enable row level security;
-- Deliberately no policies: see ACCESS above.

revoke all on public.conversion_jobs from anon, authenticated;

-- The private bucket the PDF is uploaded to and the built player comes back to.
-- No policies, so only the service role can read or write it.
insert into storage.buckets (id, name, public)
values ('conversions', 'conversions', false)
on conflict (id) do nothing;
