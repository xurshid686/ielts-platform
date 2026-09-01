@AGENTS.md

# IELTS platform — read this before touching anything

Next.js 16 (App Router) + Supabase. An IELTS practice site: students take real
computer-delivered-exam ("CDI") reading and listening tests, which are
self-contained HTML files served into an iframe, graded on the server.

Production: https://ielts-platform-pi.vercel.app
Dev preview: https://ielts-platform-dev.vercel.app

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

Order: **run 0040 → deploy the code → confirm it is live → run 0041.**
Verification queries are in 0041's header.

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

- **`PendingFunctions` in `database.ts`.** A function that exists in a migration
  but is not yet applied cannot be in the generated types, so it is declared
  there temporarily. `record_activity_for` (0040) is listed now. **Delete each
  entry once its migration is applied and the types are regenerated** — a stale
  override would hide a signature change.
- **`rows<T>()`, exported from `database.ts`,** is the one sanctioned place to
  assert a query result into an app row type, because text-column unions and
  `jsonb` shapes cannot be proven by the compiler. It replaced seven scattered
  `as unknown as T[]` casts. Do not reintroduce those; if a value comes from
  outside the app's own writes, narrow it at runtime instead (`asAnswerKey` /
  `asAnswers`).

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
- No "show more" paging — all 185 cards render at once.
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
