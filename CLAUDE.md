@AGENTS.md

# IELTS platform — read this before touching anything

Next.js 16 (App Router) + Supabase. An IELTS practice site: students take real
computer-delivered-exam ("CDI") reading and listening tests, which are
self-contained HTML files served into an iframe, graded on the server.

## Where production actually is — READ THIS BEFORE DEPLOYING

**mockonline.uz is served by DigitalOcean App Platform, behind Cloudflare. It is
NOT the Vercel deployment.** Confirmed 2026-09-01 from its response headers
(`x-do-app-origin`, `Server: cloudflare`), and by comparing the built chunk
sets: after a `npm run go-live`, Vercel served the new build and mockonline.uz
was still serving the previous one.

| URL | Host | Updated by | Database |
| --- | --- | --- | --- |
| **https://mockonline.uz** — the site students use, and `SITE_HOST` | DigitalOcean | **NOT `npm run go-live`** | Frankfurt |
| https://mockonline-2m8db.ondigitalocean.app | DigitalOcean | (same app) | Frankfurt |
| https://ielts-platform-pi.vercel.app | Vercel | `npm run go-live` | Frankfurt (since 2026-09-02) |
| https://ielts-platform-dev.vercel.app | Vercel | `npm run save-dev` | Frankfurt (since 2026-09-02) |

## The two Vercel hosts used to read a DIFFERENT database

Fixed 2026-09-02. Until then, both Vercel hosts pointed at project
`cxgwxzkqccpyuhacwvum` — a snapshot of Frankfurt taken around 29-30 August —
while the DigitalOcean hosts read Frankfurt. `.env.local` still points at that
snapshot, which is what the "OLD, DEAD project" note below refers to; it was
never dead, it was serving both Vercel URLs.

**How it was found, and the trap in finding it:** a test that exists only in
Frankfurt returned **HTTP 200 on every host**, because a missing test renders a
friendly "Test not found" page rather than a 404. Status codes prove nothing
here — compare the `<title>`, or use `/api/guest-grade` (service-role) which
returns `{"error":"Not found"}` versus a real `total`.

**What it cost:** one student (Xondamir) reached a Vercel URL from a bookmark —
the hosts correctly serve `X-Robots-Tag: noindex`, so it was not search — and
five of his attempts, including a band 9, were written to the snapshot. They
were copied into Frankfurt on 2026-09-02 with their original ids, timestamps
and rating fields; his rating chain was continuous (Frankfurt ended at 1389,
the stranded rows ran 1389 -> 1439), so nothing had to be invented.
`profiles.rating` was deliberately NOT recalculated.

The fix was to point all three Supabase vars for Vercel Preview (dev) and
Production at Frankfurt. **If you ever repoint a host's database, remember
`NEXT_PUBLIC_*` is inlined at BUILD time — an env change needs a redeploy, not
just a save.** `npx vercel redeploy <url>` rebuilds without merging `dev`.

**`npm run go-live` DOES reach the real site — indirectly.** It merges dev into
main, pushes, and deploys Vercel. The DigitalOcean app is configured with
`deploy_on_push: true` on `main` of `xurshid686/ielts-platform`, so the push
also triggers a DigitalOcean build. Confirmed 2026-09-02: the deployment's
cause read "commit 68066e9 pushed to .../tree/main" and it went
BUILDING -> DEPLOYING -> ACTIVE in about **2.5 minutes**.

So the two hosts update from the same push, but NOT at the same moment — Vercel
finishes first. For a deploy-order-sensitive migration, still wait for the
CANONICAL host, and check with `doctl apps list-deployments <app-id>` rather
than guessing.

App id: `4f6bbb48-50e8-49f2-ba7b-63d9eb92a515` (name `mockonline`, region fra).
There is no `.do/app.yaml` in the repo — the spec lives only in DigitalOcean.
Read it with `doctl apps spec get <app-id>`.

This matters far beyond a stale page: **a deploy-order-sensitive migration
(0034, 0041) keyed to "deploy the code first" is keyed to the WRONG deploy if
you only ran go-live.** Applying 0041 while mockonline.uz still ran the old
code would have broken speaking submissions and silently stopped XP for every
student on the live site.

Before running any not-backward-compatible migration, verify the CANONICAL host
is on the new build:

```
curl -s https://mockonline.uz/ | grep -oE '/_next/static/chunks/[^"]+' | sort -u | md5sum
curl -s https://ielts-platform-dev.vercel.app/ | grep -oE '/_next/static/chunks/[^"]+' | sort -u | md5sum
```

Identical hashes = same build. Different = mockonline.uz has not caught up.

Vercel production: https://ielts-platform-pi.vercel.app
Dev preview: https://ielts-platform-dev.vercel.app

## Production environment variables (DigitalOcean)

`.env.digitalocean` in the repo is a REFERENCE LIST, not what is deployed. The
live values are in the app spec. As of 2026-09-02:

| Variable | Stored as |
| --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY`, `NEW_DB_PASS`, `GEMINI_API_KEY`, all four `TELEGRAM_*`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | encrypted |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEW_PROJECT_REF` | plaintext — **deliberate**, these are public by design |

Two things were wrong here until 2026-09-02 and are worth not reintroducing:

- **`SUPABASE_SERVICE_ROLE_KEY` and `NEW_DB_PASS` were stored in plaintext**
  while the Google client id — which ships to every browser anyway — was the
  only encrypted one. Mark a new secret `type: SECRET` in the spec.
- **`GEMINI_API_KEY` was missing entirely**, so AI speaking feedback and the
  live conversation degraded to "isn't set up yet" on the real site while
  working everywhere else. `CRON_SECRET` is still absent and that is fine — the
  schedules live in `vercel.json` and run on Vercel, which has it.

To change one: `doctl apps spec get <app-id> > spec.yaml`, edit, then
`doctl apps update <app-id> --spec spec.yaml --wait`. Quote every value —
an all-digit value is parsed as a number and rejected, and a value containing
`:` is parsed as a mapping. `doctl apps spec validate` FALSE-FAILS on a
round-tripped spec ("secret env value must not be encrypted before app is
created") because it validates as if creating a new app; `update` accepts it.

---

# Workflow Rules (IMPORTANT — follow exactly)

## Branches
- ALWAYS work on the `dev` branch. Run `git checkout dev` at the start of every session.
- NEVER commit directly to `main`. `main` is production.
- Never push untested code to `main`.

## Saving & deploying
- After making changes, run: `npm run save-dev`
  - Commits to `dev`, pushes, and deploys a Vercel PREVIEW aliased to
    https://ielts-platform-dev.vercel.app
  - Optional message: `npm run save-dev -- "what changed"`
- Test every change on the dev preview URL BEFORE going live.
- Only when the user says "go live", run: `npm run go-live`
  - Merges `dev` into `main` and deploys to PRODUCTION.
  - Refuses to run with uncommitted changes — `save-dev` first.
- **Git auto-deploy is deliberately DISABLED** (`vercel.json` →
  `git.deploymentEnabled: {main: false, dev: false}`). A push building nothing is
  correct behaviour, not a broken integration. Do not "fix" it, and do not run
  raw `vercel deploy` — the scripts above alias the stable URLs.

## General
- All secrets live in `.env.local` (local) and Vercel env vars — never hardcode them.
- Ask before deleting anything.
- Never remove existing features when adding new ones.

---

# How this system works

## The answer-key pipeline — the most fragile thing here

A CDI file contains its own answer key, explanations and evidence, and builds its
entire post-submit experience from them. It also used to hand them to anyone with
devtools. The current design threads both needs:

1. **Serving** (`/api/test-html/[id]`) — `sanitizeTestHtml()` blanks
   `correctAnswers`, `acceptableAnswers`, `explanations`, `evidence` and `KEY`,
   leaving `const x = {}`, and injects a bridge.
2. **Working** — the student has no answers available, anywhere.
3. **Submitting** — the bridge posts the answers to the platform (graded and
   saved by `saveResult()`), and fetches the key back from
   `/api/test-key/[id]`.
4. **Restoring** — it `Object.assign`s the literals back into those objects,
   removes its CSS overrides, restores the test's own `markOnPage` /
   `showResults`, and calls them. The student sees the file's native Result
   Report, exactly as the standalone HTML does.

**Why `Object.assign` and not assignment:** those objects are top-level `const`
in a *classic* script. A const binding is not a property of `window`
(`window.correctAnswers = …` silently does nothing) and cannot be reassigned —
but it IS visible by name to a later classic script, and the emptied object is
mutable. Function declarations like `showResults` *are* on `window`, which is why
overriding those works. Do not change this without understanding it.

**`/api/test-key` returns the literals' raw SOURCE**, not parsed data, so each
file gets its own shape back. See "CDI shells are not uniform" below.

**If you break this, the symptom is:** the student submits and nothing appears.
That exact regression has already happened once and was reported by the user.

## Entitlement lives in ONE place

`src/lib/tests/access.ts` → `resolveTestAccess(id)`. Both `/api/test-html` and
`/api/test-key` call it. **They must never diverge** — if the key route were more
permissive than the file route, it would hand out answers for tests the caller
could not open. Any new route that touches test content uses this helper.

Rules it enforces: anonymous callers get free, regular-track tests only; premium
needs an active membership or an admin; non-regular tracks (pre_ielts/intro) are
404 to everyone else. There is no per-test XP unlock any more — that mechanic and
its `unlocks` table were removed in 0039.

Accepted exposure, and its limit: anyone entitled to *take* a test can call the
key route and read its answers without answering honestly. Submitting a blank
test reveals the same thing, in the standalone file too. What matters is that
premium keys stay unreachable without a membership.

**That reasoning does not cover the rating ladder, and this is a known open
hole.** Fetch the key, POST perfect answers to `saveResult` with a plausible
`durationSeconds`, and the attempt is server-graded, passes `apply_rating`'s
anti-cheat (which trusts the client-supplied duration) and tops the leaderboard.
The blank-submit argument holds for *seeing* answers; it does not hold for
*banking a rated result*. The fix is a server-issued attempt record —
`startAttempt -> submit -> grade -> review` — which would also give the
anti-cheat a duration it measured itself. Not built yet. Do not widen the key
route's access before it is.

## Scored records are written by the server. All of them.

The rule: **anything that moves a number a student is judged on — a result, a
speaking band, XP, streak — is written by a server action using the
service-role client, with the user id taken from the verified session.** No
client-side write path exists for any of them, and the table grants say so.

This was true for `results` only (0038). Three siblings were still open, and
0041 closed them:

| what | was | now |
| --- | --- | --- |
| `results` | `revoke insert` (0038) | unchanged |
| `speaking_submissions` | owner `FOR ALL` — a member could POST `score: 9.0` | `revoke insert, update, delete` (0041) |
| `writing_submissions` | same, and the feature hasn't shipped yet | `revoke insert, update, delete` (0041) |
| `record_activity(int)` | granted to `authenticated`, 30 XP per call, **no per-day cap** | revoked; server calls `record_activity_for(uuid, int)` (0040) |

Two things follow that are easy to get wrong:

- **`record_activity_for` takes the user id explicitly.** The old function read
  `auth.uid()`, which is NULL under the service role — swapping the client
  without swapping the function silently awards nothing. Always pass
  `p_user_id: user.id` from the verified session.
- **`apply_rating` deliberately KEEPS its `authenticated` grant.** It cannot
  fabricate anything: it rates an existing row, checks ownership, refuses
  keyless tests and retakes, and is idempotent (0036). Do not "tidy" it into
  the revoke list.

`saveResult` also refuses a submission with no `testId`, and one whose test has
no stored key. Those two branches used to write the caller's own numbers.

## Applying 0040 and 0041

Same class of hazard as 0034 — read that section first.

- **0040 is additive.** It only creates `record_activity_for`. Safe any time.
- **0041 is NOT backward compatible.** It revokes the grants the *old* code
  depends on. Applying it before the deploy breaks speaking submissions and
  silently stops awarding XP.

Order: **run 0040 → deploy the code → confirm it is live ON mockonline.uz →
run 0041.** Verification queries are in 0041's header.

"Confirm it is live" means the CANONICAL host, not the Vercel URL — see "Where
production actually is" at the top of this file. `npm run go-live` does not
update mockonline.uz.

**Status (2026-09-03): 0040, 0041, 0043, 0044, 0045 and 0046 are all APPLIED
to Frankfurt.** 0046 (Discipline) is additive, so it carried no deploy-order
hazard. 0044 (test slugs) and 0045 (the grant it needs) were applied
together on 2026-09-03 and verified: 186/186 rows slugged, no duplicates, and
`anon` can read `slug` while `answer_key` stays refused.

**Historical note (2026-09-01): 0040 was APPLIED, 0041 was NOT.**
0040 was verified in production: `record_activity_for` exists and is granted to
`service_role` only, and `record_activity` still works for the old code path
(both tested inside rolled-back transactions). That is why the site is fine in
this in-between state — 0040 is additive and the old wrapper still delegates
correctly. 0041 is deliberately held until mockonline.uz serves the new build.

## Which database a script talks to

Every script in `scripts/` now gets its credentials from `scripts/env.mjs`, and
prints the target host on every run. Nothing hardcodes `.env.local` any more.

```
node scripts/audit-answer-keys.mjs                 # live (.env.frankfurt)
node scripts/audit-answer-keys.mjs --env=local     # .env.local
IELTS_ENV=local node scripts/audit-answer-keys.mjs # same
```

**This matters because `.env.local` still points at the OLD, DEAD project.**
Each script used to carry its own copy of a loader that hardcoded that file, so
`npm run seed`, `backfill:keys` and the answer-key audit connected to a database
nothing serves, did their work and reported success. The default is now `live`,
and the target is printed, so a wrong-database run is visible rather than
silent. Fixing `.env.local` itself is still worth doing — `next dev` reads it.

## CDI shells are not uniform

The library contains **more than one generation** of test HTML. Do not assume a
single flow:

- Some shells: `#deliver-button` opens a review overlay; the real submit is
  `#reviewSubmit` → `finalSubmitFromReview()`.
- Others: `#deliver-button` *is* Submit, with a `window.confirm()`.
- Evidence is `evidence[q].snippet` in one generation and `.text` in another;
  `correctAnswers[q]` is a string in one and an array in another; some declare
  `acceptableAnswers`, some don't. Listening files use `KEY` instead of
  `correctAnswers`, and their `evidence` quotes name the answer outright.
- Some `evidence[q]` entries are legitimately `null`.

Hook the file's own `showResults`, never a specific button. Any click-based
fallback must be gated on the file's own `testSubmitted` flag — treating a
"deliver" click as a submit once revealed every answer while the student could
still go back and change them.

## Migrations can be deploy-order-sensitive

`supabase/migrations/0034_hide_answer_keys.sql` revokes column-level SELECT on
`tests.answer_key`, `file_path`, `file_url`. It is **not backward compatible**:
older code that does `select("*")` on `tests` fails, `test-detail` calls
`notFound()`, and every `/reading/[id]` returns 404.

**Order is always: deploy the code → confirm it is live → run the migration.**
Applying 0034 before deploying took the site down once. The rollback is in the
migration's header comment.

Because of 0034, `answer_key` / `file_path` / `file_url` are readable **only**
with the service-role client (`createAdminClient()`). Client-side queries must
name their columns — `select("*")` on `tests` will fail.

### Every NEW column on `tests` needs its own grant

Revoking a **column** converts a role's table-wide SELECT into an enumerated
per-column grant. So after 0034, `anon` and `authenticated` hold SELECT on
exactly the columns that existed then, *by name* — and **any column added later
is born unreadable to them**. PostgREST then fails the whole statement, not just
the column:

```
select("id, slug, title, …")  ->  permission denied for table tests
```

0044 added `slug` and hit this immediately: `test-detail` got null, called
`notFound()`, and every `/reading/<id>` rendered its not-found body. 0045 is the
one-line fix, and the shape to copy:

```sql
grant select (slug) on public.tests to anon, authenticated;
```

**It is easy to miss in review.** `generateMetadata` reads with the service-role
client, so the page kept its correct `<title>` while the body was a 404 — it
looks right in exactly the check a person runs first. Verify a schema change by
querying with the ANON key, not just by loading the page.

(`is_public` is also missing from the client grants. Nothing reads it
client-side today; grant it if anything ever does.)

## Data realities (checked against production, 2026-09-01)

Re-check these before reasoning about them — the previous snapshot (2026-07-31)
had gone badly stale and advice was built on it.

- **186 tests: 173 reading + 13 listening** (2026-09-01, `scripts/audit-answer-keys.mjs`
  against the LIVE Frankfurt project). Was 185 on 2026-08-29.
- **`tier` is `free` on every single test — there are ZERO premium tests.** The
  whole premium/free split described below still exists in code, and the DB
  still has the column, but nothing is currently gated. Do not repeat the old
  "57 free / 64 premium" claim, and do not build a monetisation argument on a
  paid catalogue that isn't there.
- **18 profiles hold an active `premium_until`** (of 102 accounts) — they are
  paying for, or were granted, access to a premium library that is currently
  empty. Worth resolving before selling more memberships.
- `question_types` — **all tagged**, backfilled by
  `scripts/backfill-question-types.mjs` from the papers' own rubric wording
  (`src/lib/ielts/infer-question-types.ts`, unit-tested). Re-run after bulk uploads.
- `difficulty` (Elo) — **has moved on exactly 1 of the library** (range 1136–1500). It
  only moves after 5+ scored first attempts. Do not build a difficulty filter on
  it, and do not present it as meaningful.
- `level` (free text) — **NULL on all but one.** Not displayed; do not add filters
  on it. Not the same thing as `profiles.level` / `tests.track`.
- Every test has a stored answer key (`total > 0`), so all of them are
  server-graded; the manual score-entry fallback should never appear. Since
  0041 this is enforced rather than assumed: `saveResult` REFUSES a submission
  with no `testId` and one whose test has no stored key. Both used to be
  written with the caller's own raw/total/band. Re-run
  `scripts/backfill-keys.mjs` if a keyless row ever appears again — students
  will be told the test can't be scored until you do.
- 200 saved results across 102 accounts.
- No topic or Cambridge book/series taxonomy exists.

## The reading catalogue

`src/components/sections/test-browser.tsx` + `skill-section.tsx`.

- **One catalogue**, free and premium together. There used to be a separate
  blurred "Premium materials" block above everything, which made the whole site
  read as paid. Do not reintroduce a separate premium grid.
- **Ordering is by TIER and flips with the viewer**: a free user gets free tests
  first, a subscriber gets premium first. This is deliberately *not* "what you
  can open" — a subscriber can open everything, so that sort buried the library
  they pay for.
- All / Free / Premium buttons filter on the test's **tier**, not on openability.
- Stats cards render only once the user has attempts; empty ones pushed the tests
  below the fold.
- Premium cards keep real titles. No blur.

## Public vs account-only

`/reading`, `/listening` and each test's detail page are **public**. A visitor
with no account can browse everything and take a **free** test; the attempt is
graded by `/api/guest-grade`, which **persists nothing**, and they are invited to
register to save it.

`src/proxy.ts` guards only `/dashboard`, `/writing`, `/speaking` and `/admin`.
The `(app)` layout falls through to `PublicShell` when there is
no profile — use `getProfile()` (nullable) on public pages, `requireProfile()`
(redirects) on account-only ones.

---

# The Telegram admin bot

`/api/telegram` is a webhook the OWNER uses to run the site from a phone. It is
deliberately single-user; there is no role check because there is no session.

## The three gates, in order

1. `X-Telegram-Bot-Api-Secret-Token` must equal `TELEGRAM_WEBHOOK_SECRET`
   (timing-safe). A mismatch returns a bare **404**, not a 401 — an
   authentication challenge tells a prober the endpoint exists.
2. `from.id` must equal `TELEGRAM_OWNER_ID`. Checked on the **user** id, never
   `chat.id`: those happen to be equal in a private chat, and stop being equal
   the moment the bot joins a group.
3. Missing config fails **closed**. An unconfigured deploy refuses everything.

A stranger who passes gate 1 gets no reply at all — not a refusal. A refusal
confirms an admin bot lives here. The attempt is `console.warn`ed so it is
visible in the deploy logs.

## Rules for anything added to it

- **Never return a non-200 after gate 1.** Telegram redelivers on any non-200,
  so a thrown error becomes the same action run twice. Errors are caught and
  reported *into the chat*. `src/lib/telegram/api.ts` never throws for this
  reason — every call returns a `TelegramResult`.
- **The bot cannot call the admin RPCs.** `set_premium`, `gift_xp`,
  `set_user_level`, `set_leaderboard_hidden` and `set_user_role` all start with
  `is_admin(auth.uid())`, and `auth.uid()` is NULL under the service role, so
  every one of them raises. This is the same trap as `record_activity` in 0040.
  Write-capable commands need service-role `_for` / `_as` variants that take the
  target id explicitly, with the session RPC delegating to them — one copy of
  the logic, web UI unchanged. Do NOT instead UPDATE `profiles` directly: it
  works (the 0023 guard only fires for `authenticated`/`anon`), but it forks the
  premium/XP rules into a second implementation that will drift.
- **Pure modules stay pure.** There is no vitest config and therefore no `@/`
  alias, so `auth.ts`, `format.ts`, `callback.ts` and `router.ts` import
  relatively and must never pull in `server-only` or a Supabase client. That is
  what keeps them unit-testable.
- `callback_data` is capped at **64 bytes**. `encodeCb()` throws rather than
  emit an over-long payload, because Telegram's own failure mode is a button
  that silently does nothing.
- Queries name their columns. `select("*")` on `results` drags every student's
  40-question answer map across the wire.

## Uploading a test — one shared path

`src/lib/tests/create.ts` -> `createTestFromHtml()` is now the only place a
`tests` row and its storage object are created. Both `uploadTest()` in
`app/actions/admin.ts` and the bot's upload wizard call it, so the answer-key
refusal cannot drift between them.

It is authorisation-free on purpose — a library, gated by its callers
(`assertAdmin()` in the action, the webhook's owner check in the bot). Do not
call it from anywhere that has not gated first.

Two things changed when it was extracted:

- **It writes with the service-role client**, where `uploadTest` used the
  admin's session client. Strictly more permissive at the DB layer, still gated
  above, and it removes a dependency on 0035's storage policies continuing to
  grant admins write access.
- **It refuses a duplicate `skill` + `title`.** `renameTest()` already enforced
  this and creation did not, which left the hole open at the only moment a
  duplicate can appear. It matters because `scripts/upload-listening.mjs` and
  `upload-premium-batch.mjs` both run `delete().eq("title", ...)` before
  inserting, so two tests sharing a title means the next re-upload silently
  deletes the wrong row. **This is a behaviour change to the web upload form:**
  re-uploading a corrected paper under an existing title is now refused. Rename
  or delete the old one first.

## Notifications

Two different mechanisms, because signup and submission are different problems.

- **A student finished a test** — `after()` in `saveResult()`
  (`app/actions/results.ts`) calls `notifyNewAttempt()`. `after` runs the
  callback once the response is finished, and the notifier swallows its own
  errors, so an unreachable Telegram can neither delay nor fail a submission.
  No infrastructure; it works as soon as the env vars are set.
- **A student signed up** — a Postgres trigger, migration **0043**, APPLIED to
  Frankfurt on 2026-09-02 and verified end to end (a throwaway account produced
  `status_code 200` in `net._http_response` and a delivered message; the account
  was deleted). There is no application code in the signup path to hook:
  `profiles` rows come from `handle_new_user()` on `auth.users`, and
  registration goes straight through the Supabase client. Cron is not an
  option either — vercel.json's schedules fire on the Vercel copy, not on the
  live DigitalOcean host.

0043 adds `pg_net`, a `private.app_settings` table holding the endpoint and its
bearer secret (the `private` schema is revoked from anon and authenticated, so
neither can read it), and an AFTER INSERT trigger on `profiles`.

**The endpoint it calls is `ielts-platform-dev.vercel.app/api/telegram/event`,
not mockonline.uz** — that is the only host carrying `TELEGRAM_EVENT_SECRET`.
It reads the same Frankfurt database, so this is correct rather than merely
convenient, but move it once DigitalOcean has the Telegram vars:

    update private.app_settings set value = 'https://mockonline.uz/api/telegram/event'
     where key = 'telegram_event_url';
 It cannot break signup: the body is wrapped
in `exception when others then null`, `net.http_post` is asynchronous, and the
trigger is AFTER. The price is that a failed push is silent — look in
`net._http_response`.

`TELEGRAM_EVENT_SECRET` gates `/api/telegram/event` and is deliberately
separate from `CRON_SECRET` so the two rotate independently. Read 0043's header
before running it; it needs two settings rows filled in first.

## Secrets and setup

`TELEGRAM_BOT_TOKEN`, `TELEGRAM_OWNER_ID`, `TELEGRAM_WEBHOOK_SECRET` — in
`.env.local` for dev and in DigitalOcean's App-Level Environment Variables
(encrypted) for production. **Together they grant full owner control of the
site: treat them like `SUPABASE_SERVICE_ROLE_KEY`.** DigitalOcean does not
hot-reload env — redeploy after adding them.

Manage the webhook with `npm run tg -- info | set <https://host> | delete`
(`scripts/telegram-webhook.mjs`; reads the token from the env files so it never
enters shell history). `info` prints `last_error_message`, which is where a
wrong secret or a Cloudflare challenge shows up — check it first when the bot
goes quiet.

**A bot has exactly ONE webhook.** Pointing it at production takes the dev
preview offline. Use a second BotFather bot for dev. And do not reuse the
premium-contact bot from `src/lib/site.ts` — this webhook would swallow every
student message sent to that handle.

`src/proxy.ts` excludes `api/telegram` from its matcher: the webhook has no
session and every update would otherwise pay for an `updateSession()` round
trip and come back with browser cookies attached.

---

# Verifying changes

`npm run build`, `npx tsc --noEmit` and `npx vitest run` are the floor, not the
bar. Anything touching the test player must be driven in a real browser —
Playwright is available at `C:\Users\user\node_modules\playwright` with Chromium
already cached.

A meaningful check of the player asserts, at minimum:

- the key is absent while working (`Object.keys(correctAnswers).length === 0`)
- and present after submit
- `#submissionModal` visible, `#userScore` / `#bandScore` populated
- `.analysis.show` blocks rendered, a `.show-evidence-btn` produces
  `span.evidence-highlight` in the passage
- reopening a finished test still shows a populated report
- `/api/test-key/<premium id>` returns 403 to a guest and to a free member

Create throwaway accounts with the service-role admin API and delete them
afterwards; never leave test users behind.

**Beware of harness bugs masquerading as product bugs.** Several "failures"
during this work were the test script driving a submit flow the file didn't have,
or asserting before an async fetch resolved. Confirm what the page actually does
before concluding the feature is broken.

---

# Database types are generated. Regenerate them.

`src/types/supabase.ts` is **generated from the live Frankfurt schema** and must
not be hand-edited:

```
SUPABASE_ACCESS_TOKEN=<token> npm run types
```

(The token is a Supabase *personal access token* — it is never stored in the
repo. `npm run types` wraps the generator; the project id is pinned in
`package.json`.)

`src/types/database.ts` derives the app's types (`Profile`, `Test`, `Result`, …)
from those rows and adds two things the generator cannot know: narrowed unions
(Postgres has `role text`, not an enum) and the real shapes of the `jsonb`
columns. Because it derives with a `Narrow<>` helper whose keys are constrained
to the row's keys, **a renamed or dropped column fails the build in that file**.

All four Supabase clients now take `<Database>` (`server`, `client`, `admin`,
`middleware`). A wrong table, view, column or RPC name is a compile error —
verified: `from("leaderboard_globl")` fails `tsc`.

**Run the generator after every migration.** The types are only as true as the
last run. What this replaced was a hand-written file claiming to match
`0001_init.sql` — 40 migrations behind — that described a `tests_public` view
which has never existed.

Two things to know:

- **There are NO pending overrides any more, and `database.ts` says so.**
  `PendingFunctions` / `PendingTables` — hand-written stand-ins for objects a
  migration had created but the generator had never seen, because nobody had a
  Supabase access token — were deleted on **2026-09-05**, when `npm run types`
  was finally run against the live schema. `Database` is now just the generated
  type. Everything they declared (the `*_as` RPCs from 0042, the `discipline_*`
  tables and RPCs from 0046, `discipline_days.published` from 0047) is generated.
  If you add a migration and need the app to compile before you can regenerate,
  bring the pattern back for that migration's objects only and delete it again
  the moment the types are regenerated — **an override that outlives its
  migration hides the real signature**, which is worse than having none.
- **`rows<T>()`, exported from `database.ts`,** is the one sanctioned place to
  assert a query result into an app row type, because text-column unions and
  `jsonb` shapes cannot be proven by the compiler. It replaced seven scattered
  `as unknown as T[]` casts. Do not reintroduce those; if a value comes from
  outside the app's own writes, narrow it at runtime instead (`asAnswerKey` /
  `asAnswers`).

# Slug URLs are BUILT but switched OFF — `USE_SLUG_URLS`

Migrations 0044/0045 are applied and every test has a slug, but
`USE_SLUG_URLS` in `src/lib/tests/ref.ts` is **`false`**, so public URLs are
still `/reading/<uuid>`. Both forms always RESOLVE; the flag only decides which
one the site LINKS to, and whether the uuid 308s away.

**Why it is off.** On 2026-09-03 the site was found already ranking for
"the return of black footed ferret reading" — at a uuid URL, on a page with 106
words, carried by its `<title>` alone. Renaming a URL Google already ranks
forces a re-crawl and re-attribution, and shipping that in the same release as
the content meant neither change could be told from the other if rankings moved.
A URL's keywords are a weak signal; its content is a strong one. So the content
shipped alone and the rename waits for Search Console to measure it.

**To turn it on:** set the flag to `true`. Links, sitemap, canonical tags and
the proxy's 308 all key off it, and `ref.test.ts` pins the current side so the
flip fails loudly rather than silently changing every public URL. No database
work is pending.

`src/lib/tests/ref.ts` owns the mapping — `testPath()` for links, `refColumn()`
for lookups — and **must stay client-safe**, because `test-browser.tsx` is a
client component and imports it. The server-side slug lookup lives in
`lib/tests/canonical.ts`.

Never retire uuid URLs: they are in students' bookmarks, in Telegram history,
and in the `next=` of every sign-in link already sent.

**The 308 is emitted by `src/proxy.ts`, not by the page, and it has to be.**
`permanentRedirect()` returns a real status code only while the response is
unstarted. Called from a page component — never mind a component below it —
Next has already begun streaming the shell and silently downgrades the redirect
to `<meta http-equiv="refresh">`. The browser still moves, so it *looks* fixed;
what actually happens is the uuid URL answers **200 with a full duplicate of the
page**, which is the exact thing the redirect exists to prevent. The page keeps
its own `permanentRedirect` as a backstop for when the middleware lookup fails.

Check a redirect with `curl -o /dev/null -w '%{http_code} -> %{redirect_url}'`.
A 200 with a populated body is the failure, and it is invisible in a browser.

# The Discipline challenge

A day-by-day programme for a hand-picked set of students. Migration
**0046**, applied to Frankfurt on 2026-09-03.

## NO DAY IS LOCKED — the sequential gate was removed (2026-09-08)

Every published day is open to every member, all the time: the missed one, the
current one, and every day ahead.

It used to be strictly sequential — `loadStudentProgress()` set
`locked: i > currentIndex`, and `discipline/page.tsx` simply did not render the
test links of a locked day. So **one missed day walled off the entire rest of
the ladder**, and a student looking at a page of padlocks and "Finish Day N to
unlock this" had no way to tell that the late day itself was still open. The
owner reported exactly that. A challenge that answers a slip by removing the
work is the opposite of what it is for.

`StudentDay` now has **no `locked` field at all** — deleted rather than
falsified, so a new caller cannot grow a dependence on it. Do not reintroduce
one. Two things make that safe and cheap:

- **The lock was never enforced.** `canOpenTrack()` checks membership and
  "attached to a published day", and no RLS policy, RPC or route ever compared a
  test's day against the student's current day. A member who guessed a future
  paper's URL could always open and submit it. Removing the lock removes zero
  security; it only stops hiding work from the honest.
- **`currentIndex` still exists and is unchanged.** It is the lowest unfinished
  day, and it still drives the "Day N of M" header, the highlighted card, the
  admin grid's current-day column, the Trailing/median flag and the `current_day`
  cache. It just no longer decides what a student may see.

Pace is now communicated instead: the deadline line ("3 days left" / "2 days
late"), the red **Late** badge, and the owner's manual Strike. Publish/draft
(0047) is the one remaining gate, and it is RLS-backed.

**Membership IS the grant.** A row in `discipline_members` means the student is
in; no row means the section does not exist for them — no nav entry,
`/discipline` redirects to `/dashboard`, and the programme's tests 404. There is
no locked teaser page, on purpose: a non-member never learns it is there.

This is deliberately NOT the shape of the `is_my_student` + `assignments` system
that 0039 removed (see "Removed features"). That was a per-user flag plus a
targeting join table for arbitrary content; this is one shared ladder of days,
and the membership row carries the student's own state (`current_day`,
`strikes`) rather than a bare boolean on `profiles` — which is also why the 0023
privileged-field trigger did not have to grow another column.

## Where the gates are

- `requireDiscipline()` in `src/lib/auth.ts` — the page gate. Admins pass with a
  null member row and get an "admin preview" that also shows DRAFT days.
- `resolveTestAccess()` in `src/lib/tests/access.ts` — the CONTENT gate, and the
  only one that matters for answer keys. The `discipline` track cannot go
  through `canAccessTrack()`, because that compares against `profiles.level` and
  no level ever equals `discipline`; it gets its own membership lookup in the
  same function, so `/api/test-html` and `/api/test-key` still cannot diverge.
- `src/proxy.ts` — `/discipline` is in `PROTECTED`.
- The catalogue needs no new filter: `skill-section.tsx` already keeps only
  `track === "regular"`, so discipline papers are excluded by construction.

## A day is a DRAFT until it is published

Migration **0047**, applied to Frankfurt on 2026-09-05. `discipline_days.published`
decides whether students can see a day at all, so the owner can load next week's
papers in advance and release them deliberately.

- **Existing days were backfilled to `true`.** The column is added `default true`
  and the default is THEN lowered to `false`, so the backfill happens inside the
  ADD COLUMN: days that were already live stay live, days created afterwards are
  drafts, and re-running the migration cannot re-publish something since
  unpublished.
- **The database hides drafts, not just the UI.** The RLS policies on
  `discipline_days` and `discipline_day_tests` require `published` for a member
  (admins see everything), and `resolveTestAccess()` refuses a paper that is not
  on a published day — so a member who is handed the URL of a draft paper gets a
  404. This is why the old production build was safe during the rollout: it knew
  nothing about the column, but it reads days with the student's own RLS-scoped
  client, so the policy hid drafts from it anyway.
- **Publishing an EMPTY day is refused** (`setDayPublished`). `deriveDayStatus`
  only calls a day complete when it has at least one test, so a live empty day
  can never be finished: it pins the student's current day on itself forever,
  holds the cohort median down, and sits on the grid as a column nobody clears.
  (It no longer locks the days behind it — nothing does — but it is still a dead
  end with no obvious cause.)
- **Unpublishing costs nobody their progress** — completion is derived from
  `results` rows, which are untouched. The day just disappears until it returns.
- Drafts are excluded from the progress rule entirely: `loadProgramme()` and
  `loadProgrammeAsAdmin()` filter on `published` unless explicitly asked for
  drafts, and only `/admin/discipline` and the admin preview of `/discipline`
  ask. Building next week's days therefore cannot move anyone's current day.

## The admin page refreshes; it must never reload

`admin-discipline.tsx` used to end every successful action with
`window.location.reload()`. That threw the owner back to the top of the Members
tab after each publish, upload, edit or reorder, and wiped the confirmation
message the action had just set before it could be read. It was the only
`window.location.reload()` in the codebase.

`useRunner` now runs the action inside a React 19 transition and calls
`router.refresh()` — the pattern the rest of the admin UI already used. Two
things follow, and both bit during the change:

- **Anything seeded from props at mount must be reset by hand**, because nothing
  remounts any more. The "Add a day" number box is the trap: it is seeded from
  `days.at(-1).day_number + 1` once, so after adding Day 5 it would still read 5
  and the next click would fail with "Day 5 already exists". It advances itself
  in `run`'s `onSuccess`, which is also where the edit form, the library picker
  and the upload form close.
- **Do not clear the busy flag from a `useEffect`.** The lint rules reject
  setState-in-an-effect as a cascading render, and correctly: derive it from the
  transition's `pending` instead, so buttons un-busy themselves when the
  refreshed payload lands rather than when the action merely resolves.

## The track gate: `canOpenTrack`, never bare `canAccessTrack`

Fixed 2026-09-05, after the owner reported a Discipline paper being invisible to the
student it was built for.

`canAccessTrack()` compares a track against `profiles.level`, and **no level is ever
'discipline'** — so it returns false for every non-admin and a Discipline paper 404s. That
was always known: `resolveTestAccess()` carried its own membership check for the track.
**But `TestDetail` — the page — called bare `canAccessTrack`**, so from 0046 until the fix a
member clicking a paper on their own programme got "not found": the paper was listed, the
API would have served the file, and the page refused to render it.

It stayed hidden for two reasons, both worth remembering: **admins pass `canAccessTrack`
unconditionally**, so the owner could open everything; and every day built before that used
ordinary `track: 'regular'` library papers, which never reach the branch. The first paper
uploaded through the day card — which forces `track: 'discipline'` — was the first to hit it.

The rule now lives once, in `canOpenTrack()` in `src/lib/tests/access.ts`, and both
`resolveTestAccess()` (the API) and `TestDetail` (the page) call it. **Do not re-inline it,
and do not add a third caller that reasons about tracks on its own.** Entitlement lives in
ONE place; this was that rule being broken by omission rather than by disagreement.

### Verifying an access change: two traps that make a browser test lie

Both cost real time on 2026-09-05. Any future test of a gate must avoid them:

1. **`notFound()` on these pages answers HTTP 200**, with the 404 UI streamed into the body
   — the same "response already started" mechanic that degrades `permanentRedirect` into a
   meta refresh. **A page's status code proves nothing.** Assert on the rendered DOM.
2. **The string "This page could not be found" is in EVERY page's RSC payload**, as the
   layout's `notFound` template, and `textContent`/`page.content()` include `<script>`
   bodies. Searching the HTML reports a 404 on a page that rendered perfectly. Use
   `document.body.innerText`.
3. A refused page renders EITHER the app-shell 404 or an empty main, depending on timing.
   Assert "the paper's title is not shown", not which of the two appeared.
4. Playwright must `waitForLoadState("networkidle")` before submitting the login form.
   Clicking pre-hydration submits it NATIVELY, nothing signs in, and every later assertion
   silently describes a logged-out visitor.

## The progress report — no email ever reaches it

The Progress tab has **Save as Word** (a real `.docx`, via the `docx` package) and a
**Hide emails** toggle, both added 2026-09-05. The owner screenshots that tab and shares
it with a students' group, which is what both exist for.

- **`buildProgressReport()` never reads `GridRow.email`, and there is no flag to make it.**
  A report is a file that gets forwarded; the on-screen toggle is cosmetic and separate,
  and the document does not consult it. Do not add an "include emails" option.
- **The client sends which rows, never what the numbers are.** `exportDisciplineReport()`
  takes `userIds` (the filtered selection, in display order) and re-derives every figure
  with `loadProgressGrid()`. Same principle as scored records being server-written.
- It returns base64 from a server action rather than streaming from a route handler, so it
  reuses `assertAdmin()` instead of needing a second gate. Fine at tens of KB; if the
  cohort ever grows enough to matter, that is the trade to revisit.
- The document uses **ISO dates**, not `toLocaleDateString()`: it is rendered on the server
  and read by other people, and "9/5/2026" means two different dates depending on who
  opens it.
- The wording helpers live in `discipline-report-text.ts`, which imports NOTHING — the same
  constraint as `discipline-shared.ts`, so they can be unit-tested without a `@/` alias.
- `docx` is server-only. Verified after the build that it does not reach any client chunk;
  keep it that way.

## Uploading a Discipline paper

**Both doors must attach the paper to a day.** A Discipline paper is reached only through
the programme, so one that lands on no day is invisible to everyone — including the owner
who uploaded it. On 2026-09-05 the /admin/tests form offered "Discipline challenge only"
and attached nothing, so a listening paper uploaded there went nowhere. That form now
requires a day when the track is Discipline, and both paths attach through the single
`attachTestToDay()` helper in `src/lib/discipline.ts`.

Two doors, one pipeline. The ordinary upload form (`/admin/tests`) has a fourth
**For** option, "Discipline challenge only"; and each day card on
`/admin/discipline` has its own "Upload a new paper" form, which uploads and
attaches in one step. Both call `createTestFromHtml()` — the ONE place a `tests`
row and its storage object are created — so the answer-key extraction and the
duplicate-title rule cannot drift between them. The in-day form forces
`track: 'discipline'` and `tier: 'free'`: a premium gate on top of the
membership gate would be a second lock on the same door.

**The Telegram bot deliberately does not offer this track.** A discipline paper
that is not attached to a day is invisible to everyone, including the owner who
uploaded it, and the bot's wizard has no step for choosing a day.

A day can also point at an ordinary public test — that is what "import from the
overall tests" means. Attaching one does NOT make it private.

## Progress is DERIVED, not stored

This is the important thing about the feature, and it was learned the hard way.

Progress used to live in `discipline_members.current_day` and the
`discipline_completions` table, both written only by `recordDisciplineProgress()`
when a test was submitted. Any programme edit then left them lying. On
2026-09-04 the owner deleted a finished Day 1 and built a new one: the completion
row cascaded away with the deleted day, the counter stayed at 2, and a student
with a single Day 1 in front of them was told they were on **Day 2**.

So `src/lib/discipline.ts` now computes everything on read, and the rule lives
in exactly one place — the student page, the admin grid and the recorder all go
through `deriveDays()` / `loadFirstAttempts()`:

- a **test** is done when the student has a `results` row for it dated at or
  after their `reset_at` (any row, if never reset);
- the score shown is their **first** such attempt, matching `apply_rating`,
  which only rates a first attempt — a re-do never rewrites history;
- a **day** is complete when it has at least one test and every one is done;
- the **current day** is the lowest incomplete day, or the last day once the
  programme is finished. It is never a day that does not exist, and the header
  reads "Day N of M".

Consequences worth knowing: attaching a test to a day a student had finished
REOPENS that day, so it becomes their current day again (correct — there is new
work), though nothing after it is hidden any more; and
deleting and rebuilding a day no longer loses anyone's progress, because the
results it is derived from are still there.

`discipline_completions` and `current_day` are still WRITTEN — the first as
history (it carries a real `completed_at`), the second as a convenience cache
for anyone querying the database directly. **Neither is read for gating or
display.** Do not reintroduce a read of them; that is the bug. Retiring the
column is a deploy-order-sensitive migration nobody has needed yet.

The Members tab is projected from the same grid the Progress tab renders
(`membersFromGrid()`), so the two tabs cannot disagree about a student's day.

## Strikes and Reset

**Strike enforcement is MANUAL and that is a decision, not a gap.** Nothing
detects a missed day; the owner presses "Strike" on `/admin/discipline`, and at
`STRIKE_LIMIT` (3, in `src/lib/discipline-shared.ts`) presses "Reset". Do not
add a cron that resets students automatically without asking.

**Reset stamps a date; it does not delete anything.** `reset_discipline` (0046)
sets `discipline_members.reset_at = now()`, and the derivation above ignores
every result older than it. So a reset costs the student their place in the
challenge while their `results` rows, XP, streak and rating survive untouched —
which matters, because those are scored records the platform grades and ranks
on. A reset that deleted results would claw back rating from a real ladder.

`STRIKE_LIMIT` lives in `discipline-shared.ts` rather than `discipline.ts`
because the latter is `server-only` (it holds the service-role writer) and the
admin UI is a client component.

## The progress grid

`loadProgressGrid()` builds it: members down, days across, each cell holding one
entry per test on that day. Scores are the student's **first** attempt, matching
`apply_rating` (which only rates a first attempt), so the grid and the
leaderboard cannot tell different stories about the same paper. Two flags, and
they mean different things: **Inactive** = nothing submitted in 3 days (never
having started counts), **Trailing** = current day below the group median. It
honours `reset_at` like everything else, so after a reset the grid shows the
student's NEW run rather than the one they lost.

`moveDay()` swaps two days by parking the mover on a NEGATIVE day_number first.
`day_number` is unique, so a straight two-step swap collides at step one.

Day cards carry `data-day={day_number}`. It is the only stable handle on a card
once it switches into edit mode and its heading text disappears — a browser test
that located cards by heading text edited the wrong day without it.

## Writes

Every discipline table revokes INSERT/UPDATE/DELETE from `anon` and
`authenticated` (0046), on the same reasoning as `results` (0038) and the
speaking/writing submissions (0041): a completion moves a student's standing, so
it is written by the server from a verified session. Membership and strikes go
through four SECURITY DEFINER RPCs (`grant_discipline`, `revoke_discipline`,
`add_discipline_strike`, `reset_discipline`) that re-check
`is_admin(auth.uid())` — which means, as ever, that **the Telegram bot cannot
call them under the service role**; a bot command would need `_for` variants.

# The Mock exam section

Migration **0050**, applied to Frankfurt on 2026-09-15. A full mock —
Listening, Reading, Writing, in that order — that a student requests, the owner
approves, the student sits ONCE, and whose result stays hidden until the owner
RELEASES it. Every attempt is kept permanently.

## The one rule: no score before release

A student never receives a band, raw mark or correct answer for an unreleased
attempt. Everything below exists to hold that:

- **Mock scores are NOT in `results`.** `results_select_owner_or_admin` lets a
  student read their own rows through PostgREST, so a band there leaks the
  moment they submit. It would also feed rating, XP, leaderboard, dashboard and
  `times_done`. Scores live only in `mock_attempts`.
- **The three mock tables have NO grants for anon/authenticated** (RLS on, no
  policies). Verified: a student JWT gets `permission denied` on read and write.
  `src/lib/mock.ts` (service role, authorisation-free, gated by its callers) is
  the only door; student loaders go through `toStudentAttempt()`, which drops
  scores unless `status = 'released'`. No admin RPCs — like the reverted
  Cambridge library, plain TypeScript is what lets the Telegram bot's
  Approve/Reject buttons (`mkA` / `mkR`) call it.
- **`/api/test-key` refuses `track = 'mock'`** for non-admins. The student IS
  entitled to the paper mid-section, so the shared gate passes; without this
  the key would give answers mid-exam and the score on submit. The bridge treats
  the 403 as "no report", which is the wanted exam behaviour.
- **`saveResult` refuses a mock paper** and **`TestDetail` 404s one** for
  everyone. Otherwise the practice page for the same paper would bank it as
  practice and show the band.
- `canOpenTrack` → `canOpenMockPaper()`: a paper opens only while it is the
  section the student is currently on (`nextSection()`); after submit it is a
  404, which is what makes it one sitting.

## Premium members join without a request (owner, 2026-09-18)

A student with an active `premium_until` sees **Join this mock** instead of
Request: `joinMock` (actions/mock.ts) re-reads the membership server-side, then
`selfJoinMock` (mock-admin.ts) gives the place through the same `createAttempt`
an approval uses — same snapshots, readiness check and notification, and the
0051 trigger closes any request they sent before. Only the place is instant:
the session start, one attempt and release are unchanged. Free students keep
request → approve, and their card also offers **Buy premium** (the Telegram link from lib/site.ts — there is no checkout). The owner gets an info-only Telegram (`notifyMockJoined`).

## Records survive account deletion

`mock_attempts.user_id` is `on delete set null` with name/email snapshotted, and
answers are copied into the attempt. `mocks` referenced by an attempt are
`on delete restrict`; `deleteMock` refuses, unpublish instead. `cancelAttempt`
only deletes an unstarted place.

## Traps found in the E2E run — do not reintroduce

1. **Fetch memoization in a render.** supabase-js selects are GET fetches and
   Next memoizes identical GETs for the life of a server render. The writing
   page reads the attempt, starts the clock, then re-read it — and got the
   pre-update copy, so every student's FIRST visit to Writing redirected to the
   overview (a reload worked). `startWriting()` now returns the timestamp from
   its own PATCH. Any lib function that writes then re-reads during a render has
   this bug.
2. **No `revalidatePath` / `router.refresh()` after a section submit.** A
   revalidating server action re-renders the current route; the section page
   redirects away from a submitted section, which unmounted the "submitted —
   continue" screen. All `/mock` pages are dynamic, so nothing is cached anyway.
3. Uppercase CSS labels: `innerText` returns "RESULT RELEASED", so a
   case-sensitive text assertion false-fails.

## Flow and where things are

- Papers: upload **inside the mock form** (0054 — parsed + live-checked there);
  /admin/tests with **For = "Mock exam only"** still works but skips the check
  until "Check paper" is clicked in the form.
- Code is split: `src/lib/mock.ts` (student side + the shared attempt
  breakdown), `src/lib/mock-admin.ts` (owner side, server-only),
  `src/lib/mock-shared.ts` (pure: bands, stages, CSV, dates — unit-tested).
- Admin: `/admin/mocks` — workload counts, a per-mock scope, Requests (bulk
  approve), Results (stage chips, search, date range, sort, 50/page, bulk
  release, CSV of every filtered row, phone cards) and the Mocks builder
  (readiness checklist, Save draft / Save & publish, Duplicate, Unpublish).
  **Filters live in the URL** (`tab, mock, stage, q, from, to, sort, page`) and
  attempt links carry `?back=` so Back returns to the same view.
- `/admin/mocks/attempts/[id]` — grading queue for that mock (oldest submission
  first, "n of m", Save & next), essays, per-question review, Release.
- Nav: **Admin is a dropdown** (Overview, Mock exams, Discipline, Tests,
  Members, Admins for the owner) in the same slot — no extra bar item. The
  account name next to the avatar is hidden between `lg` and `2xl`: with a long
  name the admin bar overlapped the header icons at 1280px (this pre-dated
  mocks; measured in the E2E run). Student nav has "Mock"; admins do not.
- Student: `/mock`, `/mock/[id]`, `/mock/[id]/[section]`, `/mock/[id]/result`.
- Writing clock is enforced server-side in `saveWriting()` (deadline + 60 s
  grace, then the saved draft is handed in).
- Bands: writing = (T1 + 2×T2)/3, overall = mean of L/R/W, IELTS rounding.
- Telegram: `notifyMockRequest` (Approve/Reject buttons) and `notifyMockFinished`.
- `src/types/database.ts` carries PENDING overrides for 0050–0054. Run
  `npm run types` and delete them.

## Admin-side rules (0051 + the 2026-09-15 Codex review)

- **Readiness is one validator** (`readinessIssues` in mock-admin.ts) used by
  publish, approve AND direct grant: both papers exist, right skill, Mock
  track, usable answer key; both prompts; 10–180 min. Drafts save regardless.
- **Exam content locks once the session starts** (0054; before that: once any
  place existed) — papers, prompts, minutes, image — enforced in `saveMock` and
  the image actions, not only the UI.
  Duplicate to change. Attempts also SNAPSHOT writing minutes + image path at
  grant and the answer key at grading (0051), so nothing live can re-mark
  history. Replaced Task 1 images are never deleted from storage for the same
  reason.
- **A new place closes the student's pending request in the same transaction**
  (trigger `mock_attempt_resolves_request`, 0051). Approving a student who
  already has a place reconciles instead of failing.
- **Release is conditional and returns the row**; the student is notified only
  by the call that flipped it, so double/bulk releases cannot double-notify.
  The grade form disables Release while it has unsaved edits.
- **Admin loaders throw on DB errors and page with `fetchAll`** — PostgREST
  caps responses at 1000 rows even without `.limit()`, and an error must never
  read as "nothing pending".
- Owner actions are wrapped in `guarded()`: failures come back as messages; the
  panel disables every action while one runs.
- CSV cells go through `csvCell` (formula prefixes neutralised — student names
  are student-controlled) with a UTF-8 BOM.

## Anti-cheating (0052 + 0053) — a deterrent and a record, not a lock

Designed in a meeting with Codex, Grok and agy (2026-09-15); the owner decided
the open points. **What a browser cannot enforce, stated plainly:** a second
phone, a helper in the room, screenshots, browser extensions. Nothing below
claims otherwise, and nothing changes a score or submits automatically because
of a signal.

**Owner decisions:** laptop/desktop only; fullscreen required; leaving
fullscreen covers the test, **the clock keeps running, Listening audio pauses**;
repeated exits → warning + "Review suggested" for the teacher, never automatic.

- **Server clocks for every section.** Since 0054 `beginSection()` /
  `beginWriting()` stamp the start once (the Start click) and RETURN it
  (fetch-memo trap); `startSection()`/`startWriting()` only resume. Minutes are snapshotted
  (`listening_minutes`/`reading_minutes`/`writing_minutes`, 40/60/60 default).
  After deadline + 60 s grace only the saved draft counts; `finalizeExpiredSection()`
  closes an expired section when the student lands on any mock page — ONE step
  per request, and the caller must `redirect()` (memo again).
- **Drafts + no replay.** The runner asks the bridge for `SNAPSHOT` every 15 s →
  `saveMockSectionDraft` (answers + furthest audio position, forward-only). After
  a reload it sends `RESTORE`; `restoreAnswers()` (scoring-bridge.ts) refills text
  and radio/checkbox inputs and reports drag-drop numbers it cannot restore. The
  audio resumes at the saved position and any rewind is snapped forward. Before
  0052 a reload replayed the recording from 0.
- **ExamGuard** (`components/mock/exam-guard.tsx`) wraps runner and writing:
  device gate (`isExamCapableDevice`: fine pointer, short side ≥ 700, element
  Fullscreen API), BroadcastChannel second-tab block, "Enter fullscreen & begin"
  (user gesture; content not mounted before), opaque overlay + `inert` on exit,
  hidden-tab ≥ 2 s logged, escalating warning copy. `DeviceNotice` stops a phone
  BEFORE "Start the mock" starts the clock.
- **Section links use `prefetch={false}`** — rendering an active section page
  records a reload.
- **Events** go to `POST /api/mock-events` (route, so `sendBeacon` works on
  pagehide), session-identified, validated/clamped/capped by the pure
  `applyIntegrityEvents()`; reloads and timeouts are recorded server-side.
- **Integrity writes are compare-and-set on `integrity_rev` (0053)**
  (`mutateIntegrity`). Plain read-modify-write lost a second-tab event when the
  page, the events route and another tab wrote at once.
- **Report:** `integrityVerdict()` → clear / review / incomplete with reasons
  (≥3 long exits, ≥60 s away, second tab, reload during Listening, paste ≥100
  words, ≥3 rewinds, L/R finished in <25% of the time). Integrity card on
  `/admin/mocks/attempts/[id]`; "Review suggested" chip + badge + CSV columns on
  Results.
- **Writing paste** is allowed and logged (≥5 words; ≥100 flags). Since Writing v3 a paste of
  more than 10 words is ALSO a violation (see below).
- ~~**Leak protection:** `getReleasedDetail()` hides the per-question review while
  anyone else still has the mock open~~ — DROPPED 2026-09-16 (owner): release now
  means full review, papers included, so holding the table back only made the
  rule harder to explain. Release confirmations still warn how many are sitting.

Traps found in the E2E run: `MockGradeForm` must not rely on router.refresh()
or a transition — the action's revalidatePath left `pending` stuck and the
props never re-keyed the form, so Release stayed disabled after Save. It keeps
its own `saved`/`liveStatus` state and a plain busy flag.

**Local `next start` does not reflect deployed refresh behaviour on this page.**
On localhost:3100 a `router.refresh()` (or an action's revalidatePath) on
`/admin/mocks/attempts/[id]` often never commits: React parks the transition
(root lane 512 suspended, no ping), so the header keeps "Needs grading" until a
reload. `/admin/mocks` refreshes fine locally, and a buffered (route-intercepted)
response commits fine. On the Vercel dev preview the same flow updates the header,
Overall and Released time after Save / Release / Unrelease with no reload
(verified 2026-09-15). So the "header stale after Release" item was a harness
artifact, not a bug: check refresh-dependent UI on the dev preview, not on
localhost. Because the form's `key` includes status and graded_at, a real
revalidation remounts it, and the success message ("Released — the student has
been notified.") disappears once the page re-renders.

Headless Chromium has no MP3/H.264 codec: the 0052 E2E swapped in a generated
silent WAV; the 0054 E2E launches Playwright with `channel: "msedge"`, which
plays the real MP3 recordings and MP4 instruction videos.

## Sessions, instruction videos, the mock adapter (0054)

Owner decisions (2026-09-15): an approved place is NOT enough to start — the
owner clicks **Start session** (`mocks.session_state` waiting → running), which
admits every approved student, late approvals included, until **End session**
(→ closed: nobody new starts; students already `in_progress` finish). Each
section begins with a section-specific **instruction video** (fullscreen, no
seek, but **skippable** — see below); the **section clock starts at the "Start
<section>" click after it**, never on page open. Mock mode is automatic and the CDI paper's own start
screen, timer and results never show — only the platform clock, centred in the
top bar. Papers are uploaded **inside the mock form**, parsed, and live-checked.

- **The rule lives in `admissionError()`** (mock-shared.ts), used by
  `startAttempt`, `sectionView`, the video actions and `beginSection` /
  `beginWriting`. Existing mocks were backfilled to `closed` once (inside the
  same DO block that adds the column, so re-running 0054 closes nothing).
- **Minutes/papers are editable while `waiting`, even with places approved**;
  `startMockSession` re-snapshots every unstarted place to the mock as it is at
  Start. Locked once running/closed (`isLocked`).
- **A closed session can be REOPENED** (`closed → running`, `reopenMockSession`).
  Start and Reopen share one `openSession(mockId, adminId, from)` body; the
  reopen path keeps `session_started_at` (the first sitting's start) and clears
  `session_closed_at/_by`. Reopening admits approved students again and lets new
  places be granted, but hands NOBODY a second attempt: the snapshot/notify
  queries only touch places still `approved`, `startAttempt` refuses a status
  that is not `approved`, and `mock_attempts_one_per_student` (0050) still
  stands. Content stays locked, because attempts were snapshotted at the first
  Start — duplicate the mock only to run a CHANGED sitting.
- **Section lifecycle:** `sectionView()` (read-only) → phase `video` | `ready` |
  `active`. `startSection()`/`startWriting()` now only RESUME a running clock
  (and record the reload); they never stamp. `beginSection()`/`beginWriting()`
  stamp and return the runner payload so the client swaps to the paper WITHOUT a
  navigation (a render of an active section records a reload). Writing prompts
  reach the browser only in `beginWriting`'s result, never during the video.
  `submitSection` no longer invents a start stamp.
- **Video progress:** `saveVideoProgress` is forward-only and capped at the
  server's own elapsed time since the first save + 3 s; `markVideoDone` needs
  `videoWatchedEnough` (elapsed ≥ 90% of duration − 2 s). A reload asks via
  `beforeunload` (browser wording) and resumes from `*_video_pos`. The three MP4s
  are on R2 `cdi-videos` under `mock/<section>-instructions-v1.mp4`; rows in
  `mock_videos` (no client grants). Admin "Instruction videos" card replaces a
  video by URL (duration read in the browser, HEAD-checked on the server).
- **Skip (2026-09-16):** a small "Skip" sits bottom-right over the video, visible
  and clickable from the first frame — including while it is still buffering or
  after it failed to load. It calls `finishMockVideo(..., skipped)` →
  `markVideoDone(..., skipped)`, which bypasses ONLY `videoWatchedEnough`; every
  other guard (right section, `admissionError`) still applies, and it stamps
  `_video_done_at` exactly as finishing does, so `beginGuard` needed no change.
  A skip writes a `video_skip` integrity event (via `mutateIntegrity`, only on
  the call that actually stamped, so the client's 12-try retry loop cannot log
  it twice). That event is **evidence, not a violation**: it moves no counter
  and never feeds "review suggested". Scrubbing stays blocked — Skip is the
  honest way out, the same stance the `mock-intro-video` skill takes.
- **`components/mock/section-flow.tsx`** owns the ExamGuard for the whole
  section (video → Start → paper/writing) and a shared `mediaRef` so leaving
  fullscreen pauses the video or the recording. `ExamTopBar`/`ExamClock` is the
  one top bar (clock centred). `PaperSection` (mock-runner.tsx) and
  `WritingSection` render inside it.
- **THE "DONE" BUG:** CDI files store state under hard-coded localStorage keys
  and the mock iframe is same-origin, so a student who had finished the paper in
  practice saw "Done" and no Submit in the mock. Fix = `lib/ielts/mock-adapter.ts`:
  a **storage shim injected as the first script in `<head>`** that proxies
  local/sessionStorage into `mock:<attemptId>:<section>:` (practice keys are
  never read or written). The practice bridge could not fix it — it runs after
  the paper's `loadState()`.
- **Mock papers are served through `adaptForMock`, not the practice bridge.**
  `/api/test-html/<id>?mock=<attemptId>` → `findMockSitting()` (the student's
  attempt, this paper, section clock running, not expired) else 404 — a mock
  paper without that context is refused to students. The adapter: hides start
  screen/`.header__center`/`#examTimer`/results; replaces `autoSubmit`,
  `autoSubmitMock` (and the listening player's `startTimer`/`startCountdown`)
  with no-ops — paper functions are classic-script globals, so replacing
  `window.X` reaches the paper's own bare-name calls; starts the paper via
  `startWithMode('mock')` / `beginTest('mock')` / `#startTestBtn`, or the
  listening mock card; reports a native submit once via `showResults`/`#doSubmit`
  wrappers. Handshake: `READY → RESTORE → RESTORED → ACTIVATE` (Listening: click
  Play; a blocked autoplay shows an in-paper "Start the recording" gate), plus
  `SNAPSHOT`, `SUBMIT`, `LOCK`. The top bar's **Submit <section>** hands in from
  a fresh snapshot (4 s fallback to the server draft).
- **Three player families** cover all 208 library papers (survey 2026-09-15):
  `reading-classic` (#startTestBtn, count-up timer), `reading-modes`
  (beginTest/startWithMode, countdown + autoSubmit), `listening-player`
  (#playOverlay mode cards, #playBtn, #doSubmit). A file with none of their
  hooks is rejected at upload — add an adapter, don't loosen the check.
- **Parsing = `lib/ielts/mock-profile.ts` (static, never runs the file) + a live
  self-test in the admin's browser** (`components/admin/paper-self-test.tsx`,
  `/api/test-html/<id>?selftest=<nonce>`, admin only, throwaway namespace):
  ready, own-timer can't hand in, every answer reads back, every key question
  has a box, answers survive a reload (drag answers reported, not failed),
  Listening audio loads. `recordSelfTest` stamps the result with the profile's
  file hash; `readinessIssues` requires a passing check for the CURRENT hash
  plus all three videos. Papers uploaded before 0054 get "Check paper"
  (`reprofilePaper`).
- `src/types/database.ts` PENDING overrides now cover 0050–0054 (including three
  `tests` columns via `PatchedGenTables`).

### v2.1 — submit, leaving and refresh (owner decisions 2026-09-15)

- **No browser dialogs inside a mock paper.** Chrome leaves fullscreen whenever
  a page opens `confirm`/`alert`/`prompt`, and every CDI paper confirms its
  submit with `window.confirm` — students were thrown out of fullscreen and told
  "You left fullscreen". The storage shim replaces `confirm` (→ `REQUEST_SUBMIT`
  or `NOTICE`, returns false so the paper never grades itself), `alert`
  (→ `NOTICE`), `prompt`, and makes the paper's `requestFullscreen` /
  `exitFullscreen` no-ops. `PaperSection` answers `REQUEST_SUBMIT` with its
  in-page confirm box. NEVER use a browser dialog anywhere in the exam flow.
  (Note: reading shells' `doSubmit()` has no confirm — the student path is
  `finalSubmitFromReview()`, which does.)
- **One fullscreen for the whole sitting:** ExamGuard fullscreens
  `document.documentElement`, not its div (removing the fullscreen element on a
  client navigation ends fullscreen). A guard that mounts already-fullscreen
  goes straight to active, so "Continue to Reading" lands on the video with no
  click. The platform leaves fullscreen only via `leaveExamFullscreen()`
  (sets a flag so the guard shows no overlay and records no departure).
- **Back button:** SectionFlow pushes a guard history entry; `popstate` opens
  "Leave the exam?" (Stay / Leave). Leave = last-moment save, leave fullscreen,
  full navigation to `/mock/<id>`. Refresh/close keeps `beforeunload` (Writing
  now always warns while open).
- **Last-moment save:** `POST /api/mock-draft` (sendBeacon) on pagehide and
  Leave — Listening/Reading read answers synchronously through
  `window.__IELTS_MOCK_HARVEST__` in the paper; Writing sends both texts.
  Section drafts now MERGE onto the previous draft (drag answers the paper
  could not restore after a reload are not wiped), and autosave/beacon are held
  back until RESTORED so a fresh page can't blank the draft.
- **Abandoned sections close on time:** `finalizeExpiredAttempts()` runs when
  the admin opens `/admin/mocks` or an attempt, when a session ends, and in the
  daily cron. Students still close their own on any mock page. Attempts whose
  account was deleted are skipped. A student who stops BETWEEN sections (next
  clock never started) stays "in progress" — there is no clock to run out.
- Overview shows "Continue · N min left" (`current_minutes_left`, computed in
  lib — `Date.now()` in a server component trips the react purity lint).

### Surviving a host outage (2026-09-17)

A transient DigitalOcean 503 on the paper iframe mid-Listening exposed four
defects. The 503 itself was ~90 s of a single App Platform instance being
unavailable; the paper is 285 KB, so nothing to do with size.

- **A throw used to lock a student out of submitting FOREVER.** `submit()` in
  mock-runner.tsx sets `handled.current = true` before the await so a double
  click cannot submit twice — but there was no `try/catch`, so a REJECTED server
  action (what a 503 does) never put it back, and `saving` stayed true. Every
  later attempt, including the time-up auto-submit, returned early. Now
  try/catch/**finally**, and the `auto` path retries (`SUBMIT_RETRIES`) because
  it has no human to press the button again. `submitSection` refuses a second
  submit and grades the server draft after expiry, so retrying is safe. A
  server REFUSAL is never retried — only a transport failure.
- **READY does not mean the paper works.** The adapter's `boot()` gives up after
  ~6 s (`tries > 40`) and sends READY with `started:false` even for papers that
  are fine. So `payload.started` is deliberately NOT a reload trigger — doing
  that would burn exam time reloading working papers. A 503 produces **no READY
  at all**, which is the signal that matters.
- **Detect a bad document by inspecting it, not by probing.** A `fetch` probe is
  a different request that may hit a different instance, so a 200 says nothing
  about what is in the frame. The frame is same-origin, so the runner checks for
  `window.__IELTS_MOCK_HARVEST__` (installed near the top of the adapter): on
  `onLoad` without it, the frame holds someone else's error page → reload. That
  catches a 503 in ~a second instead of after the 15 s readiness timeout.
  Reload = bump the iframe's `key` (a fresh document AND a fresh contentWindow,
  so stale postMessages fail the existing `e.source` check).
  **A working paper is never reloaded**; after `MAX_PAPER_RETRIES` the runner
  falls back to the old "drive whatever is there" behaviour rather than
  stranding the student, and offers a manual Reload card. The loading overlay is
  now OPAQUE — it was `bg-background/80`, so the host's 503 showed through.
  Restores use `liveAnswers` (the newest SNAPSHOT), never the stale `draft`
  prop, and `ACTIVATE` is idempotent in the adapter so the recording cannot
  start twice.
- **The outage was billed to the student, and evidence was being dropped.** It
  landed as an 82 s `away`/`fullscreen` event. Now the runner reports a
  `paper_unavailable` event (duration, **no misconduct counter**), and
  `integrityVerdict` subtracts away time that OVERLAPS an outage window before
  judging, adding a `notes` line. History is not rewritten — the `away` event
  and its counters stay exactly as recorded; only the judgement changes.
  `excusedAwayByOutage()` is pure and unit-tested. Note `applyIntegrityEvents`
  silently DISCARDS unknown event types, so a new one must be added there too.
  Separately, `flush()` in exam-guard.tsx used to `splice` events off the queue
  BEFORE an unchecked `void fetch` — so evidence of the platform failing was
  destroyed by the platform failing. It now drops a batch only on `res.ok`,
  keeps one send in flight at a time, and caps the queue (`MAX_QUEUE`).
- **Still open (the owner's):** the app appears to run ONE DigitalOcean
  instance, so a single restart takes every live exam down. Two instances plus a
  health check is the real fix, and lives in the DO console — there is no
  `.do/app.yaml` in the repo. Also unbuilt: audited per-section "extra minutes"
  compensation (needs a migration), and a deploy guard — which must gate the
  **push to `main`** (what triggers the DO rebuild), NOT `scripts/go-live.mjs`,
  which only deploys Vercel.

### The between-sections menu (2026-09-17)

"Continue to Reading" appeared to freeze for seconds and students thought the
app had hung. Four stages followed the click and the first three were silent:
a bare `router.push` with NO pending state (no `loading.tsx` covers this
segment); an un-prefetched RSC render of ~7 sequential round trips in 5 serial
stages; ExamGuard's unconditional 350 ms "Checking your device…"; and only then
the `<video preload="auto">` mounting to pull a cold 5.7-9.1 MB MP4.

- **The whole sitting now runs in one `SectionFlow`.** Phase gained `"menu"`.
  Submitting a section calls `onSubmitted` (server-CONFIRMED only, auto-submit
  included), which shows `components/mock/section-menu.tsx` inside the existing
  guard. "Continue to <next>" swaps the section in place from a descriptor —
  **no navigation, no second guard mount, no 350 ms wait.** Measured: menu up
  833 ms after submit, Continue → instructions **90 ms**.
- **`nextSectionDescriptor` (actions/mock.ts)** wraps `sectionView` and returns
  an ALLOWLISTED shape (phase, minutes, video, videoPos, blocked). Never spread
  the view — a paper, a prompt or a key must not reach the browser early. It
  writes nothing and starts no clock.
- **Do NOT fix this with route prefetching.** Rendering an ACTIVE section calls
  `startSection`/`startWriting`, which record a reload — and a reload is one of
  the three violations that auto-submit Writing. A prefetch BEFORE submission
  also caches the wrong-section redirect. The overview's `prefetch={false}`
  stays.
- **The video is warmed with a detached `<video>` element** created after a
  confirmed submit, never by mounting `InstructionVideo` out of sight: its
  effects autoplay and post progress, which would start the server's video
  stopwatch before the student saw a frame. Warming happens AFTER submission on
  purpose — during Listening the recording is streaming and a 6-9 MB
  side-download could make it stutter. R2 already serves these `immutable` with
  versioned names and byte ranges, so the warm fill is reused as-is.
- **`history.replaceState` keeps the URL on the section actually being shown.**
  A reload must land on the right section or the server accounts for the wrong
  one.
- `SectionRow` in section-menu.tsx is shared with the overview page, so the
  student sees the same three cards in both places. Writing is unchanged: it is
  last and owns its own ending (PDF copy + a Back that leaves fullscreen on
  purpose).

### Writing v3 — reference layout, 3 violations, prompt parser (owner decisions 2026-09-15)

Modelled on writing-full-test-1.vercel.app. **The one place anything automatic happens:**
three Writing violations hand the writing in. Listening/Reading keep warn + record.

- **Violations (Writing only):** the page away (window blur or tab hidden) for ≥ 5 s, a paste of
  > 10 words (the paste still lands), and a **reload** (counted by `startWriting()` on the
  render). Leaving fullscreen alone is NOT one — ExamGuard hides the test as before.
- **The server counts.** `addWritingViolation()` (via `reportWritingViolation`) folds
  `applyWritingViolation` into `integrity` with `mutateIntegrity`, which now RETURNS the record it
  wrote — use that count, never a re-read (fetch memo). It re-checks the 5 s / 10-word thresholds.
  At 3 it calls `saveWriting(final)` with the texts the browser sent, then `recordAutoSubmit`
  (`counters.writing_auto_submitted`, event `auto_submit`). On the reload path the SAVED draft
  (the pagehide beacon's) is handed in and the payload says `autoSubmitted`. No migration —
  it all lives in the `integrity` jsonb.
- **Student screen** (`writing-exam.tsx`): part rubric band, prompt left / textarea right with a
  pointer-drag divider (25–75 %), Part 1 / Part 2 footer, "Words: N". Violations 1–2 show an
  in-page "Violation N of 3" box (never a browser dialog). Done screen offers **Download PDF**
  (`lib/writing-pdf.ts`, jspdf dynamically imported; prompts + picture re-encoded as JPEG +
  answers; never a band or violations). The rules screen needs a tick before Start.
- **Prompts are parsed at display time** (`lib/ielts/writing-prompt.ts`, unit-tested). The owner
  types only the Task 1 topic sentence (+ picture) and the Task 2 question; stored text stays
  raw, so old mocks and attempt snapshots render the new layout too. `stripBoilerplate` removes
  pasted standard lines before rebuilding; Task 2 splits on a blank line, else trailing
  question sentences (`?` or Discuss / To what extent / …). `<WritingPrompt>` is the ONE
  renderer: student screen, admin preview, admin attempt page.
- **Admin form:** picture by drop / click / Ctrl+V; on a new mock it first saves the draft
  (`ensureSaved`) — the form closes and reopens as the edit a moment later. The picture is
  REQUIRED by `readinessIssues` (saveMock checks the existing row's path; it never writes it).
- **Admin review:** red "Auto-submitted: 3 violations" card (or "Writing violations: N of 3"),
  Results chip + CSV columns `writing_violations`, `writing_auto_submitted`.
- E2E: blur is simulated by dispatching `blur`/`focus` on window; a synthetic paste event
  (`ClipboardEvent` + `DataTransfer`) fires React's onPaste without inserting text.

### Released review, saveable results, deleting a mock (owner decisions 2026-09-16)

- **A released student reopens the papers they sat**, read-only:
  `/mock/<id>/review/<listening|reading>` → `/api/test-html/<test>?review=<attempt>`
  → `adaptForReview` (mock-adapter.ts). `canOpenMockPaper` now also passes a
  RELEASED attempt (`hasReleasedMockPaper`), and `findMockReview` is the gate:
  the attempt is theirs, released, and sat with that paper (an admin may open any).
- **THE MARKING IS THE SERVER'S, and the key still never reaches the browser.**
  The first cut let the paper grade itself (practice pipeline + the key from
  /api/test-key) and it showed **11/40 where the platform had recorded 38/40**: a
  reading shell grades from its INTERNAL state, which a DOM value restored by
  `restoreAnswers` never reaches, so every matching / multiple-choice / drag
  answer counted blank. So review serves the key-STRIPPED file, injects the
  per-question `ReviewLine[]` from the key snapshotted on the attempt (0051), and
  writes a ✓ / ✗-with-accepted-answer badge next to each question
  (`.__rv-ok` / `.__rv-no`), with the recorded score in a sticky `#__reviewBar`.
  `/api/test-key` still refuses every mock paper to non-admins.
- Review also: storage namespaced `review:<attempt>:<section>:`, the paper's own
  report / Show Results / Submit / Retake hidden (by id AND by button text),
  every field `readOnly` + `disabled`, and — the owner asked for free replay —
  its own `<audio controls>` in the bar, since the player's transport is exam
  chrome that review switches off.
- **The result as a file:** `/api/mock-report?attempt=<id>|mock=<id>&format=pdf|docx`
  (`lib/mock-report.ts`, jspdf + docx, both server-side). Bands, marks, feedback,
  both prompts (parsed), the Task 1 picture, both essays and the answer tables.
  A student gets their own released attempt; an admin any attempt, or a whole
  mock in one file (`MAX_BULK = 200`). `imageMeta()` reads PNG/JPEG size from the
  bytes (no image library); the PDF embeds with jsPDF compression "FAST" —
  without it a screenshot PNG made a 3.5 MB report.
- **Deleting a mock is the OWNER'S alone** (`deleteMockDefinition` checks
  `profiles.is_owner`; the panel only shows the button to the owner) and it
  CASCADES: attempts, requests and the mock's `mock-assets` folder, in that
  order — `mocks` is `on delete restrict` from attempts. The owner types the
  title, and `deleteMock(id, expectTitle)` re-checks it server-side so a
  mis-sent id cannot delete the wrong mock. **The typed title is compared with
  `sameTypedTitle()`** (mock-shared.ts), which collapses runs of whitespace and
  ignores case — client gate and server re-check MUST use the same function.
  A plain `.trim()` comparison made a real mock UNDELETABLE (2026-09-16): the
  owner's "Mock  1 Sunday" has two spaces, nobody types that, so the Delete
  button never enabled and the failure looked like delete being broken. The mock's PAPERS stay in the
  library. Unpublish is still the non-destructive option.

### Emailing the result (migration 0055, owner 2026-09-16)

Resend, through the sender that already existed in `src/lib/email/send.ts`.
**Two emails:** the released result (bands in the body, the results paper
attached, links to the result page and to both paper reviews) and a receipt when
the student finishes (no scores — nothing is marked yet).

- **Setup is the owner's:** `RESEND_API_KEY` (and `EMAIL_FROM` once the domain is
  verified) in `.env.local`, Vercel Preview and DigitalOcean (Run time; no cache
  clear needed, it is not a `NEXT_PUBLIC_*`). DNS for mockonline.uz lives at
  **webspace.uz**; Resend's three records go on `send.mockonline.uz` +
  `resend._domainkey`, so the existing MX on the bare domain is untouched.
  With no key, releases still work and the panel says "Email not sent".
- **`src/lib/email/mock-templates.ts` imports NOTHING** (the
  discipline-report-text rule) so the HTML is unit-tested; `send.ts` is transport
  and branding only. Every link is absolute — an email client has no origin.
- **`EMAIL_BASE_URL`** (`EMAIL_LINK_BASE` at run time, else `SITE_URL`) is the one
  base for the body AND the footer. `SITE_URL` is inlined at BUILD time, so
  without this a dev-preview build emailed students links to production.
- **`src/lib/mock-email.ts` is the only door.** `emailMockResult` /
  `emailMockReceipt` never throw and never block: they stamp
  `result_email_sent_at` / `result_email_to` or `result_email_error` (0055) and
  are guarded so each email goes once (`force` = the owner's Send again;
  unreleasing clears the stamp). `emailMockResults` paces a bulk release ~600 ms
  apart for Resend's ~2/second limit.
- **Sent from the actions in `after()`** (`releaseMockAttempt`,
  `bulkReleaseMockAttempts`, and next to `notifyWritingIn` for the receipt), so
  building a PDF and calling Resend never holds up the owner's click. Every
  finishing path (submit, time-out, 3-violation auto-submit) reaches the receipt
  through `saveWriting`.
- **`buildAttemptReport(attemptId, format)`** in `lib/mock-report.ts` is shared by
  the email and `/api/mock-report`, so the attachment is byte-identical to the
  download.
- Panel: the attempt page shows who it went to and when, or the failure with a
  Send-again button (`components/admin/send-result-email.tsx` — it keeps its own
  message state, the MockGradeForm re-key trap); Results has an emailed chip and
  two CSV columns.
- E2E: the server runs with `RESEND_BASE_URL` pointed at a local recorder
  (`resend-spy.mjs`), which asserts subject, from, links and the attached PDF
  without sending mail; `SPY_FAIL=1` proves a refusal leaves the result released.

### The email status bar (migration 0056, owner 2026-09-16)

Structure reviewed with Codex; its heavier suggestions (a durable job queue with
automatic backoff, open/click analytics, a suppression list) were deliberately
NOT built — a sitting is tens of emails.

- **`mock_messages` is the log**: one row per send attempt, so a retry adds a row
  instead of overwriting the last outcome, and receipts finally have an error
  trail. `provider_id` (Resend's email id) is what a webhook event is matched on;
  `mock_attempts.result_email_status` is a denormalised copy of the latest RESULT
  status so the Results list needs no join. **Writers: `lib/mock-email.ts` and
  the webhook, nothing else.** No grants, RLS on, like every mock table.
- **`/api/resend-webhook`** verifies the Svix signature over the **raw body**
  (`lib/email/verify-webhook.ts`, HMAC-SHA256 of `id.timestamp.body`, ±5 min,
  timing-safe, several `v1,` sigs supported for rotation) — no new dependency.
  Needs `RESEND_WEBHOOK_SECRET`; without it the route is 503 and statuses simply
  stop at "sent". Resend retries anything non-2xx, so: bad signature → 401,
  unknown email id / ignored event type / already-terminal row → **200, no
  change**, a database failure → 500. `shouldAdvance()` never regresses a status
  (a late `sent` after `delivered`) and lets `bounced`/`complained`/`failed` win.
- **The strip** (`components/admin/email-status.tsx`) sits above the Results
  table. Counts are per ATTEMPT — one state each, so they add up to the released
  total — computed in the panel by `countEmailStatuses()` in mock-shared.ts from
  attempts it already holds, which is why they follow the mock scope with no
  extra round trip. Each count is a button setting `email=<bucket>` in the URL,
  which filters the table via `emailBucket()`. "Email history" opens the log
  (`listMockMessages`), and the attempt page lists that attempt's own history.
- **Retries are the owner's** (`retryFailedResultEmailsAction` → `retryFailedResultEmails`):
  only attempts whose latest result email FAILED. A bounce or complaint is never
  retried — the address is wrong, so re-sending just fails again.
- **Students are told at submit** (writing done screen + the mock overview) that
  the result will be emailed with the paper attached. Nothing shows them the
  address, and the receipt wording is unchanged.
- E2E: the test signs its own Svix events with a throwaway secret and POSTs them
  at the route, so delivered / bounced / unsigned / unknown-id are all covered
  without Resend. The spy grew `POST /__fail` and `/__ok` toggles so one run
  exercises a refusal and the retry.

# Writing Task 2 practice (migration 0057)

A library of real IELTS Writing Task 2 questions — the @CDI_Report corpus, 606
unique questions in 15 topics — that any signed-in student sits on their own.
Built 2026-09-17. `/writing` stopped being a `ComingSoon` stub and became this.

**It looks like the mock's Writing screen and behaves nothing like it.** That is
the whole design, and every difference below is deliberate:

| | Mock Writing (v3) | Task 2 practice |
| --- | --- | --- |
| Clock | server-enforced, hands the writing in at the deadline | **advisory**: counts down, clamps at 00:00, and NOTHING keys off it |
| Fullscreen / device gate | ExamGuard, laptops only | none — it works on a phone |
| Violations | away >= 5 s, paste > 10 words, reload; 3 = auto-submit | none. Leaving, pasting and reloading are all fine |
| Access | request -> approve -> session window -> one sitting | any signed-in student, any number of times |
| Result | band, release, email | none. A PDF and a history row |

**Do not "unify" the two players.** The one thing they share is
`components/writing/writing-workspace.tsx`, which is PRESENTATION ONLY: the
split pane, the 25-75 % drag divider, the textarea and the word count, lifted
verbatim out of writing-exam.tsx. No clock, no persistence, no guard, no submit
lives in it. A `mode: "mock" | "practice"` prop was considered and rejected —
it would make every exam rule conditional in a live, revenue-relevant screen.

- **The easiest mistake here is copying the mock's `timeUp` branch.** In the
  mock, time up disables the textarea, disables Submit and calls `send(true)`.
  In practice there is no such branch at all: with `started_at` an hour in the
  past the box still takes text and Submit still works.
- **Nothing reuses `saveMockWriting`, `beaconDraft`, `/api/mock-draft` or
  `/api/mock-events`.** Reusing any of them drags admission rules, a
  server-enforced deadline or the violation counters back in.
- **The chrome could not be reused as-is** either: `ExamTopBar` hardcodes
  "Mock", `ExamClock` says "Official time", and the mock's `DoneScreen`
  promises marking and an emailed result. Practice has its own.

## Data and access

`writing_practice` (question) and `writing_practice_attempts` (one sitting).
**RLS on, zero policies, zero grants for anon/authenticated** — the mock tables'
stance (0050) — so `src/lib/writing-practice.ts` is the only door.

**Unlike `src/lib/mock.ts`, that module authorises ITSELF.** mock.ts is
authorisation-free by contract because the Telegram bot calls it with the
owner's id already checked; nothing here has a second caller like that, and the
service role bypasses RLS, so the ownership checks in each function ARE the
security boundary. Every attempt query carries `user_id` in its WHERE clause,
taken from `requireProfile()`. Do not add a function that trusts an attempt id
on its own.

- **The attempt SNAPSHOTS `prompt` and `topic`.** Editing or hiding a question
  must never rewrite what a student was actually asked; the read-only page and
  the PDF both render the snapshot.
- **`word_count` is counted on the server** (`countWords`), never sent by the
  browser. Same rule as every other number the platform records.
- **`revision` is compare-and-set.** A background tab holding older text gets a
  conflict message instead of overwriting newer work. No BroadcastChannel block
  — a message is enough for practice.
- **Submitting is atomic** (text + count + `submitted_at` in one UPDATE) and a
  draft write afterwards is refused.
- **A question is unpublished, never deleted.** `practice_id` is
  `on delete restrict`, so deleting one would mean deleting somebody's essay.
- **Topics are a TS constant** (`src/lib/writing-practice-topics.ts`), not a
  table or an enum: a fixed list of 15, pinned in the DB by a CHECK constraint.
  Their colours are CSS variables in globals.css with a light and a dark value —
  an inline hex cannot follow the theme — and a chip ALWAYS shows the topic's
  name, so colour is never the only signal.

## Importing the corpus

`scripts/import-writing-practice.mjs`, reading
`C:\Users\user\telegram-channel-map\wt2_topics.json`. The migration carries
schema only: the corpus grows weekly and data inlined in a migration cannot be
re-run.

```
node scripts/import-writing-practice.mjs --dry-run
node scripts/import-writing-practice.mjs --only=1 --publish   # rank 1 = most reported
node scripts/import-writing-practice.mjs                      # all of them, unpublished
node scripts/import-writing-practice.mjs --publish-all
node scripts/unpublish-practice.mjs <hash-prefix>
```

- **Identity is `source_hash`** — sha256 of the NFC-normalised,
  whitespace-collapsed prompt. Case, punctuation and wording preserved; topic
  and counts excluded. A re-run updates `appearances` and `topic` and KEEPS
  `published`. Collisions are reported, never merged. **Editing the wording
  changes the hash**, so a correction imports as a new row and the old one must
  be hidden by hand — deliberate, not a bug.
- **Only two corpus artefacts are cleaned**: a trailing channel tag (`#CDI`) and
  invisible bidi/zero-width marks. Spelling, grammar and wording are imported
  exactly as reported — that is what a student is actually asked.
- `in.(...)` goes in the PostgREST URL: 500 sha256s overflowed it and came back
  as a bare "Bad Request". The existence lookup batches **50**.
- `--only=<n>` is a RANK; a hash needs >= 6 hex characters. `--only=1` used to
  match the first sha256 starting with "1".
- **Pre-flight**: every prompt is run past the app's own boilerplate stripper and
  a copy of its question-sentence test, and anything suspicious is printed. Of
  606, the real `parseTask2()` leaves **5** without a separate question line
  (they still render — the whole text lands in the bold box). **The shared
  parser is NOT adjusted to fit them**: it is load-bearing for the live mock.

## Running a migration on this machine

`scripts/apply-migration.mjs <file>` — the `pg`-driver-on-the-pooler recipe every
migration since 0040 has used, now written down instead of retyped. One
transaction, and `loadEnv()` prints the target first.
`scripts/check-0057.mjs` is the companion check, and it verifies the thing that
matters: an **anon key is refused** on both tables, and the topic CHECK fires.
Verify a schema change with the anon key, not by loading a page.

## Task 1 and the Full test (migration 0058, owner 2026-09-18)

`/writing` has three menus — **Task 1 · Task 2 · Full test** — as
`?kind=task1|task2|full`. No kind means task2, so every pre-0058 link still works.
Same practice rules for all three. The advisory clock is 20 / 40 / 60 minutes
(`minutesOf()`), with nothing at zero.

- **A question is `task` 1 or 2** (`writing_practice.task`, default 2). A Task 1
  question has `image_path` (private bucket **`writing-practice`**, signed URLs
  only) and `chart` (pie/bar/line/table/map/process/mixed, `CHARTS` in
  writing-practice-topics.ts), and a null `topic`. A CHECK pins that shape.
- **Every catalogue read MUST filter `task`.** Pre-0058 code lists every published
  row, and a chart would appear inside the Task 2 list. The same trap is why a new
  Task 1 must not be published while an older build is live.
- **A Full test is not a question.** It is an attempt (`kind = 'full'`) on a
  TASK 1 question. `openPractice(…, "full")` pairs it with a random published
  Task 2 the student hasn't submitted yet (any Task 2 once they have done them all). The
  owner chose random pairing. The pair is snapshotted (`practice2_id`, `prompt2`,
  `topic2`), and `answer2`/`word_count2` hold the Task 2 half, so one sitting is one
  row. A reload resumes the same pair, because the open attempt is looked up by
  (user, question, kind).
- `savePractice` only writes `answer2` to a `full` row (it adds `.eq("kind","full")`).
- **Adding Task 1 questions:** the "Add Task 1" form on /admin/writing-practice
  (Task 1 tab) supports drop, click or Ctrl+V for the picture, plus the sentence and
  the chart kind. It saves unpublished. From this machine, use
  `node scripts/add-task1-practice.mjs --image=… --chart=pie --prompt="…" [--publish]`.
  Both use the same `source_hash` (`task1\n` + normalised sentence + `\n` + the
  picture's bytes), so a double upload is refused. The owner types only the
  sentence; the Cambridge lines around it come from `lib/ielts/writing-prompt.ts`.
- **Attempt `topic` holds the chart kind for task1/full**, so the chip renders.
  `topicOf()` resolves topic ids and chart ids alike.
- The Full screen's Part 1 / Part 2 footer is COPIED from writing-exam.tsx, not
  shared. That screen is the live mock and stays untouched. The PDF shares only
  `toDataUrl`/`fit` from lib/writing-pdf.ts.
- `ATTEMPT_COLUMNS` must stay ONE string literal. supabase-js parses the select
  string's type, and a `+` concatenation makes every row a `GenericStringError`.
- The clock display is clamped to the allowance, because `started_at` is the
  database's clock, which runs about 1 s ahead of the browser (it showed 20:01).

# Every test page must be linked — `Discovered - currently not indexed`

On 2026-09-07 Search Console reported **136 URLs "Found, not indexed"**
(Discovered - currently not indexed) and 8 crawled-but-not-indexed, out of 187
test pages in the sitemap. Nothing was misconfigured: robots.txt was correct,
every page server-renders 1,100-1,500 words of real passage, and each canonical
matched its sitemap entry exactly. The pages were **orphans**.

Two separate causes, both fixed the same day:

1. **The catalogue linked 24 of 174.** `test-browser.tsx` caps the grid at
   `PAGE_SIZE = 24` and reveals the rest with a client-side `setVisible` button
   — which is not a URL, so the served HTML of `/reading` carried 24 outbound
   test links and nothing else on the site linked the other ~150.
2. **`RelatedTests` linked the same 12 pages from every page.** It took the
   twelve NEWEST siblings, so all ~190 test pages emitted a byte-identical set
   of twelve links (verified by diffing three random pages). Twelve tests
   collected ~190 inbound links each; the other ~175 still had zero. A strip
   that links the same twelve pages everywhere is a sitewide nav block, not
   internal linking.

## The two rules that follow

- **`RelatedTests` rotates.** Siblings are ordered `created_at` then `id` (the
  tie-break matters — papers uploaded in one batch share a timestamp, and an
  unstable sort would hand a page different neighbours on every crawl), and each
  test links the twelve that FOLLOW it, wrapping past the end. The catalogue is
  therefore one cycle: every test has exactly 12 inbound and 12 outbound links
  and a crawler entering anywhere reaches everything. **Verified empirically**
  by crawling all 174 reading pages on the dev preview: outbound 12/12 on every
  page, inbound min 12 / max 12, 174 distinct targets, zero orphans.
- **`TestIndexLinks` is the hub** — a plain server-rendered `<ul>` of every
  paper's title, below the card grid on `/reading` and `/listening`. It exists
  because the grid cannot list everything without the cost the cap was added to
  avoid.

**Do NOT fix a future version of this by raising `PAGE_SIZE` or rendering every
card.** That was already measured and rejected: 171 cards is 506 KB of HTML and
171 hydrating subtrees. The index is plain anchors in a server component —
measured cost on `/reading` with 174 links is gzip 24 KB -> 45 KB, brotli 31 KB,
and no client work at all. Quote the COMPRESSED number if this is revisited; the
raw delta (172 KB -> 317 KB, because the markup lands in both the HTML and the
RSC payload) looks alarming and is not what anybody downloads.

And do not make the index crawler-only. A hidden block of links only Googlebot
sees is a doorway; this one is visible, uses each paper's own title as anchor
text, and is the fastest way to Ctrl-F the library.

## What was NOT the problem

Worth recording, because all three are the usual first guesses and all three
were already correct: robots.txt, the sitemap (`lastmod`, canonical-matching
URLs), and content depth. **The uuid URLs are not the cause either** — see
`USE_SLUG_URLS` above. Renaming URLs while 136 pages are waiting to be crawled
would add a re-crawl and re-attribution on top of the real problem. Leave the
flag off until indexing recovers.

Indexing is not instant: expect the 136 to clear over the following weeks as
Google re-crawls, and judge the fix by the Discovered-not-indexed count falling,
not by any single URL.

# Patterns deliberately removed — do not reintroduce

## Schema-probe fallbacks

Seven call sites used to run a query including a newer column, and if the error
message mentioned that column, run a second query without it — a standing
apology for migrations that might not have been applied. They are gone from
`access.ts`, `dashboard/page.tsx`, `skill-section.tsx`, `admin.ts`,
`admin/members/page.tsx`, `refer/page.tsx` and `results.ts`.

Do not add another. They cost a doubled query path, they were never exercised
by a test, and they swallow real errors: `access.ts` retried on *any* error
whose text contained "track", so a permissions failure looked like a missing
column and silently degraded a security-relevant read. The schema is settled —
assert it. If a migration is genuinely pending, the right answer is the
deploy-order rule above, not a runtime probe.

## `select("*")` on `results`

`results.answers` holds the student's whole 40-question response map. The
dashboard and the catalogue pulled every row of it to compute an average and a
count. Both now name their columns. `/review/[id]` still selects `*` because it
genuinely renders the answers.

`skill-section` also built its per-card attempt counts with a `res.filter` per
test — O(tests x attempts), 185 cards deep. It builds one Map in a single pass
now.

## Error boundaries

`app/error.tsx`, `app/(app)/error.tsx` and `app/global-error.tsx` exist. There
were none, so any transient Supabase failure in a server component became Next's
raw digest screen. `(app)/error.tsx` renders inside the app shell so the student
keeps the nav; `global-error.tsx` replaces the document and therefore ships
inline styles, not Tailwind.

# Known gaps / deliberate omissions

- **The test iframe's sandbox does nothing.** `test-runner.tsx` sets
  `sandbox="allow-scripts allow-same-origin"` on a frame served from our own
  origin, which disables the sandbox for that document: uploaded test HTML can
  reach `window.parent.document`, read session cookies and call server actions,
  and the restored key is evaluated with `new Function` on the parent origin.
  Scores are safe (the server grades); the session is not. The fix is a
  separate origin for `/api/test-html`, which needs DNS and a full re-test of
  the submit-and-restore flow. Today the only uploader is the owner.

- The PDF export button is hidden: `stripDownloadTools` removes the html2pdf
  library, so it would silently do nothing.
- Question-type filter is single-select; no combining types.
- ~~No "show more" paging — all 185 cards render at once.~~ **Stale.**
  `test-browser.tsx` caps the grid at `PAGE_SIZE = 24` behind a "Show more"
  button. See "Every test page must be linked" above — that cap had an SEO
  cost, and the fix was NOT to remove it.
- No admin UI yet for correcting inferred question types.
- `/pricing` and a real upgrade flow don't exist; Premium is arranged by
  contacting the admin on Telegram (`src/lib/site.ts`).
- Writing is a nav item pointing at a `ComingSoon` stub. It does NOT drag the
  overall band down (`dashboard/page.tsx` filters nulls out of `skillAverages`),
  but it is still counted in the `x/4 skills` denominator and the goal tracker.
- The rating delta shown after a test grades the student against a `difficulty`
  that has barely moved off its 1500 default (see Data realities), so the number
  is close to meaningless today.

---

# The landing page sells the product, not the signup form

The hero CTA goes to `/reading`, not `/register` — a guest can sit a free test
and be graded, so the product is the pitch. Only six links still point at
`/register`: the header, the hero's secondary button, the rank-ladder CTA, the
bottom CTA band, and two footer links — all things that genuinely need an
account. The Writing card has no `href` at all while it is a `ComingSoon` stub.

The two product screenshots come from `npm run shots`
(`scripts/capture-screenshots.mjs`), which drives the REAL site (production by
default, `--base` to point elsewhere):

- the player shot is the guest flow — note the CDI file has its own "Start Test"
  screen behind the platform's launcher, so the script clicks twice;
- the report shot is `/review/<id>` with a `results` row INSERTED by the
  service-role client, not a scripted CDI submit — shells are not uniform and
  scripting submit is the harness bug this file warns about. A throwaway account
  is created and deleted in a `finally`.
- The passage is captured in FULL — the owner's call, made deliberately: the
  shot exists to prove the product is real, and a blurred passage undercuts
  that. `--blur` opts back into blurring `.passageContent p`.
- It still hides `img.ielts-logo-img`, because the shell loads the IELTS
  wordmark from Cambridge's CDN and a registered mark in our own marketing
  implies an affiliation this site does not have. `--keep-logo` overrides.

On the page, BOTH theme variants are `loading="lazy"`. `display: none` suppresses
a lazy fetch but NOT an eager one and NOT a `priority` preload — with either of
those, dark-mode visitors also downloaded the light PNG. Verified: one image pair
per theme, ~66 KB over the wire.

# Password reset

`/forgot-password` → `resetPasswordForEmail` with
`redirectTo=/auth/callback?next=/reset-password`. The browser client is PKCE by
default, so the emailed link arrives with `?code=` and the EXISTING callback
exchanges it — there is no second route handler, and none is needed.

- `/reset-password` is deliberately NOT in `AUTH_PAGES`: the recovery link signs
  the user in before they land there, so bouncing signed-in users would make a
  reset impossible. There is a comment in `proxy.ts` saying so.
- A failed exchange whose `next` is `/reset-password` redirects to
  `/forgot-password?error=expired`, not `/login?error=auth`.
- The redirect URLs did NOT need adding in the Supabase dashboard — the allow
  list already carries host-wide `/**` entries. Verified with `generate_link`
  against all three hosts.
- **Untestable without a real inbox:** the happy path. `generate_link` mints a
  token unrelated to the browser's PKCE verifier, so it always fails the
  exchange — useful for testing the expiry path, useless for the success path.
- Known failure mode: opening the link in a DIFFERENT browser from the one that
  requested it fails the same way, because the verifier is a cookie. The copy on
  the confirmation says to use the same browser. If it becomes a support burden,
  the fix is the `{{ .TokenHash }}` email template plus an `/auth/confirm` route
  calling `verifyOtp({ type: "recovery" })`.

# Removed features — do not resurrect

Both were deleted in `0039_drop_xp_unlocks_and_my_students.sql` (2026-08-29),
code first and then the schema, in that order.

- **Per-test XP unlock.** `unlock-button.tsx`, `actions/unlock.ts`, the `unlocks`
  table and `unlock_test()`. `canAccessTest()` no longer takes an `unlocked`
  argument. XP still exists and still drives streaks, badges and leaderboards —
  it just has no spend path, which is deliberate. The landing FAQ no longer
  promises one.
- **The "My student" teaching system in full.** `/assignments`, `/feedback`,
  `/admin/my-students`, `/admin/students/[id]`, `/admin/assignments`,
  send-to-teacher on both the test runner and the speaking recorder, the
  `assignments` / `assignment_targets` / `teacher_feedback` tables, the six RPCs,
  and `profiles.is_my_student` / `can_send_to_teacher`. The privacy and terms
  pages were updated to match — Telegram is now only a contact link, not a
  processor that receives student work.
- The speaking **recorder itself was kept** (record + play back your own answer).
  Only the sending was removed, which took the in-browser MP3 encoder with it.
- The rows live on in a private `archive` schema (`archive.unlocks`,
  `archive.assignments`, `archive.assignment_targets`, `archive.teacher_feedback`),
  revoked from `anon` / `authenticated`. Never copy them back into `public` — a
  bare table there inherits Supabase's default grants with no RLS, which would
  publish the feedback notes.
- `TEACHER_CHAT_ID` in the env files and Vercel is now dead; nothing reads it.
