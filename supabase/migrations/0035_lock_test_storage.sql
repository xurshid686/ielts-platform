-- ============================================================
-- IELTS Platform — 0035: close the public read on the `tests` bucket
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to re-run.
-- ============================================================
--
-- *** BACKWARD COMPATIBLE. Safe to run before or after a deploy. ***
--
-- WHAT WAS WRONG
--
-- 0001_init.sql created the bucket with `public = true` and a blanket read
-- policy (`using (bucket_id = 'tests')`). No migration ever closed it.
-- 0034's header comment asserts the bucket is private and revokes
-- `file_path` / `file_url` so paths cannot be discovered — but that is
-- obscurity, not access control, and the door stayed open.
--
-- The object in the bucket is the ORIGINAL upload. `sanitizeTestHtml()` only
-- runs at serve time in /api/test-html. So the reachable file was the one with
-- `correctAnswers`, `explanations` and `evidence` fully populated — for
-- premium papers as much as free ones. Confirmed by fetching one with no
-- credentials at all and reading its answer key out of the response.
--
-- There were two separate ways in, and both are closed here:
--
--   1. https://<project>.supabase.co/storage/v1/object/public/tests/<path>
--      Needs no credentials. Closed by `public = false` (already applied via
--      the Storage API; the statement below is idempotent and makes the repo
--      the source of truth).
--
--   2. GET /storage/v1/object/tests/<path> with the ANON key.
--      Closed by dropping `tests_public_read`. THIS ONE IS WHY THIS FILE
--      EXISTS — flipping the bucket flag alone does not close it.
--
-- WHY THIS IS SAFE
--
-- Nothing at runtime reads the bucket over HTTP. Delivery is
-- `createAdminClient().storage.from("tests").download(...)` in
-- /api/test-html and /api/test-video, and the service-role key bypasses both
-- the public flag and RLS. Verified after applying `public = false`:
-- production /api/test-html still returns 200 with `correctAnswers = {}`.
--
-- The only casualty is `scripts/backfill-keys.mjs`, which fetched
-- `tests.file_url` over plain HTTP. It is switched to the admin download in
-- the same change set. `file_url` is no longer written on upload.
--
-- TO ROLL BACK (reopens the leak — do not, except to restore service):
--   update storage.buckets set public = true where id = 'tests';
--   create policy "tests_public_read" on storage.objects
--     for select using (bucket_id = 'tests');
--
-- ============================================================

-- 1. The bucket is private. (Already applied via the Storage API; repeated
--    here so a fresh environment built from migrations gets it too.)
update storage.buckets
   set public = false
 where id = 'tests';

-- 2. Drop the blanket read. This is the grant that let the anon key pull the
--    unsanitized file straight out of storage.
drop policy if exists "tests_public_read" on storage.objects;

-- 3. Admins keep direct read access (the admin tools list and re-upload
--    files). Everyone else goes through the gated routes, which use the
--    service-role client and are unaffected by RLS.
drop policy if exists "tests_admin_read" on storage.objects;
create policy "tests_admin_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'tests' and public.is_admin(auth.uid()));

-- The write policies from 0001 (tests_admin_insert / _update / _delete) are
-- already admin-only and are left exactly as they are.
