-- ============================================================
-- IELTS Platform — 0011: per-test completion counter
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to re-run.
-- ============================================================
-- Shows how many times a test has been completed (across all users). Results
-- are private per-user under RLS, so we keep an aggregate counter on the test,
-- incremented by a trigger whenever a result is inserted.

alter table public.tests
  add column if not exists times_done int not null default 0;

-- Backfill from existing results.
update public.tests t
  set times_done = coalesce((select count(*) from public.results r where r.test_id = t.id), 0);

create or replace function public.bump_test_done()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.test_id is not null then
    update public.tests set times_done = times_done + 1 where id = new.test_id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_result_done on public.results;
create trigger on_result_done
  after insert on public.results
  for each row execute function public.bump_test_done();
-- ============================================================
