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
needs an active membership, an admin, or a legacy XP unlock; non-regular tracks
(pre_ielts/intro) are 404 to everyone else.

Accepted exposure, by design: anyone entitled to *take* a test can call the key
route and read its answers without answering honestly. Submitting a blank test
reveals the same thing, in the standalone file too. What matters is that premium
keys stay unreachable without a membership.

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

## Data realities (checked against production, 2026-07-31)

- 121 regular-track reading tests: **57 free, 64 premium**. 8 listening.
- `question_types` — all 121 tagged, backfilled by
  `scripts/backfill-question-types.mjs` from the papers' own rubric wording
  (`src/lib/ielts/infer-question-types.ts`, unit-tested). Re-run after bulk uploads.
- `difficulty` (Elo) — **still 1500 on ~120 of 121.** It only moves after 5+
  scored first attempts. Do not build a difficulty filter on it yet, and do not
  present it as meaningful.
- `level` (free text) — **NULL on 119 of 121.** Not displayed; do not add filters
  on it. Not the same thing as `profiles.level` / `tests.track`.
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

`src/proxy.ts` guards only `/dashboard`, `/writing`, `/speaking`, `/admin`,
`/assignments`. The `(app)` layout falls through to `PublicShell` when there is
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

# Known gaps / deliberate omissions

- The PDF export button is hidden: `stripDownloadTools` removes the html2pdf
  library, so it would silently do nothing.
- Question-type filter is single-select; no combining types.
- No "show more" paging — all 121 cards render at once.
- No admin UI yet for correcting inferred question types.
- `/pricing` and a real upgrade flow don't exist; Premium is arranged by
  contacting the admin on Telegram (`src/lib/site.ts`).
- Writing is a nav item pointing at a `ComingSoon` stub, but still counts in the
  dashboard's overall-band maths and goal tracker.
