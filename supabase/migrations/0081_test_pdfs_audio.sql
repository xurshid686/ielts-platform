-- 0081: listening tests get "Get a PDF" too (owner, 2026-11-28).
--
-- A listening teacher kit is the paper PDF + the test's MP3 + the answers (spoiler). The PDF row
-- stays as it is; these two columns carry the audio:
--   * audio_url:        the public R2 URL of the MP3 (listening-audios bucket). Null for reading.
--   * tg_audio_file_id: the teacher bot's Telegram file_id for that MP3, once it has been sent,
--                       so later sends cost no upload (same idea as tg_file_id for the PDF).
--
-- Additive and idempotent: two nullable columns, nothing existing changes. The current site code
-- never selects them, so this can be applied before the code that reads them ships.
-- ACCESS: unchanged — RLS on, no policies, no grants (0066); src/lib/ultima.ts is the only door.

alter table public.test_pdfs add column if not exists audio_url text
  check (audio_url is null or audio_url like 'https://%');
alter table public.test_pdfs add column if not exists tg_audio_file_id text;
