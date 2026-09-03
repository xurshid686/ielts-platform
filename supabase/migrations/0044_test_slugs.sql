-- 0044 — readable URLs for test pages.
--
-- WHY
-- ---
-- Every test page is addressed by its uuid:
--     /reading/3fa98a00-00b3-4255-8739-d8828c872d16
-- which tells a student nothing before they click, tells Google nothing at all,
-- and is unshareable in a Telegram message. This adds the slug behind
--     /reading/the-voynich-manuscript
--
-- Doing it NOW matters: the site is not yet indexed (`site:mockonline.uz`
-- returned nothing on 2026-09-03), so no ranking signal is spent on the uuid
-- URLs and no redirect chain has to be inherited. After indexing, the same
-- change costs a 301 migration of ~190 pages.
--
-- DEPLOY ORDER — this one is ADDITIVE, unlike 0034 / 0041.
-- ------------------------------------------------------
-- It only ADDS a nullable column and an index. Code that has never heard of
-- `slug` keeps working unchanged, so this may be applied BEFORE the deploy —
-- and must be, because the new routing reads the column and there is
-- deliberately no schema-probe fallback (see CLAUDE.md, "Patterns deliberately
-- removed").
--
--     run 0044  ->  deploy the code  ->  confirm on mockonline.uz
--
-- ROLLBACK
-- --------
--     drop index if exists tests_skill_slug_key;
--     alter table public.tests drop column if exists slug;
--
-- Dropping the column strands any /reading/<slug> link already shared, but the
-- uuid URLs never stop working — the route resolves both, permanently — so a
-- rollback degrades URLs rather than breaking pages.

-- ---------------------------------------------------------------------------
-- 1. The column
-- ---------------------------------------------------------------------------

alter table public.tests add column if not exists slug text;

comment on column public.tests.slug is
  'URL segment for the public test page, unique per skill. Nullable: a row '
  'without one is still reachable by uuid. Maintained by slugify_test_title() '
  'via the trigger below.';

-- ---------------------------------------------------------------------------
-- 2. Slug generation
-- ---------------------------------------------------------------------------

-- Titles carry curly quotes, en dashes and accented letters ("Why don't we
-- sleep?", "Jellyfish – The Dominant Species"). `unaccent` is not installed and
-- is not worth installing for this, so the character folding is explicit.
create or replace function public.slugify(p_text text)
returns text
language sql
immutable
as $$
  select
    nullif(
      trim(both '-' from
        regexp_replace(
          regexp_replace(
            -- Apostrophes are DELETED, not turned into a separator: the
            -- possessive is one word to a reader and to Google, so
            -- "Australia's" should slug as "australias", not "australia-s".
            replace(
              lower(
                translate(
                  p_text,
                  'àáâãäåèéêëìíîïòóôõöùúûüýÿñçÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÝÑÇ‘’“”–—',
                  'aaaaaaeeeeiiiiooooouuuuyyncAAAAAAEEEEIIIIOOOOOUUUUYNC''''""--'
                )
              ),
              '''', ''
            ),
            '[^a-z0-9]+', '-', 'g'      -- everything else becomes a separator
          ),
          '-{2,}', '-', 'g'             -- collapse runs
        )
      ),
      ''
    );
$$;

comment on function public.slugify(text) is
  'Lowercase ASCII url segment for a title. Immutable so it can be used in an '
  'index expression and a generated backfill.';

-- Assigns a slug that is free within the skill, appending -2, -3, … on a clash.
-- Two different books really do both contain "Carnivorous plant", so collisions
-- are expected rather than exceptional.
create or replace function public.unique_test_slug(
  p_skill text,
  p_title text,
  p_id    uuid
)
returns text
language plpgsql
stable
as $$
declare
  base  text := public.slugify(p_title);
  try   text;
  n     int  := 1;
begin
  -- A title that folds away to nothing (all punctuation) falls back to the id,
  -- which is ugly but unique and still resolves.
  if base is null then
    return 'test-' || left(p_id::text, 8);
  end if;

  try := base;
  loop
    exit when not exists (
      select 1 from public.tests
       where skill = p_skill
         and slug  = try
         and id   <> p_id
    );
    n := n + 1;
    try := base || '-' || n;
  end loop;

  return try;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Backfill
-- ---------------------------------------------------------------------------

-- Row by row, oldest first: `unique_test_slug` reads `tests` to check for a
-- clash, so a set-based UPDATE would not see the slugs assigned earlier in the
-- same statement and would hand the same slug to every duplicate title.
-- Oldest-first means the established test keeps the clean slug.
do $$
declare
  r record;
begin
  for r in
    select id, skill, title
      from public.tests
     where slug is null
     order by created_at asc, id asc
  loop
    update public.tests
       set slug = public.unique_test_slug(r.skill, r.title, r.id)
     where id = r.id;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Keep it filled
-- ---------------------------------------------------------------------------

create or replace function public.tests_set_slug()
returns trigger
language plpgsql
as $$
begin
  -- Only when absent, or when the title changed and nobody has pinned a slug by
  -- hand. A slug that silently followed every title edit would break links that
  -- are already shared and already indexed.
  if new.slug is null or new.slug = '' then
    new.slug := public.unique_test_slug(new.skill, new.title, new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists tests_set_slug on public.tests;
create trigger tests_set_slug
  before insert or update of title, slug on public.tests
  for each row
  execute function public.tests_set_slug();

-- ---------------------------------------------------------------------------
-- 5. Uniqueness
-- ---------------------------------------------------------------------------

-- Per SKILL, not globally: a reading passage and a listening test may share a
-- name, and they live at different paths. Created last so the backfill above
-- cannot fail against a half-filled table.
create unique index if not exists tests_skill_slug_key
  on public.tests (skill, slug)
  where slug is not null;

-- ---------------------------------------------------------------------------
-- Verify
-- ---------------------------------------------------------------------------
--
--   select count(*) filter (where slug is null) as missing,
--          count(*)                             as total
--     from public.tests;
--   -- expect missing = 0
--
--   select skill, slug, count(*)
--     from public.tests group by 1,2 having count(*) > 1;
--   -- expect no rows
--
--   select slug, title from public.tests order by created_at desc limit 10;
