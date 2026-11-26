-- 0076 — tests.subtitle: a short secondary line shown under a test's title.
--
-- Listening full tests are now titled by number ("Test 15", "Test 16", …) and
-- the four part topics go here, shown smaller under the title on the catalogue
-- card and the test page ("Enquiry about joining Youth Council · Amersham
-- Theatre · Rocky Bay Field Trip · The Taylor Concert Hall"). Null = no line.
--
-- SAFE IN EITHER ORDER. Purely additive: a nullable column plus a widened
-- grant. Old code never selects it. Per 0045, every new column on public.tests
-- needs its own column-level grant or the client roles' catalogue select fails.
--
-- ROLLBACK
--     revoke select (subtitle) on public.tests from anon, authenticated;
--     alter table public.tests drop column if exists subtitle;

alter table public.tests add column if not exists subtitle text;

comment on column public.tests.subtitle is
  'Optional secondary line under the title (e.g. a listening test''s four part topics).';

grant select (subtitle) on public.tests to anon, authenticated;

-- Verify — expect `subtitle` in both lists:
--   select grantee, string_agg(column_name, ', ' order by column_name)
--     from information_schema.column_privileges
--    where table_schema = 'public' and table_name = 'tests'
--      and privilege_type = 'SELECT' and grantee in ('anon', 'authenticated')
--    group by grantee;
