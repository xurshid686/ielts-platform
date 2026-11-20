-- 0067 — test_pdfs.passage_label (2026-11-20)
--
-- The label printed in Telegram under every PDF: "Reading Passage 2" for a single passage,
-- "Full test · Passages 1–3" for a full test. It is read from the PDF's own banner, because
-- tests.passage is empty on 13 single tests and on every full test.
--
-- Additive and idempotent. test_pdfs has no grants for anon/authenticated (0066), so there is no
-- column-grant trap; the service role is the only reader.
alter table public.test_pdfs add column if not exists passage_label text;
