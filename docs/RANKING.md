# Reading Ranking & Leaderboard System

A competitive rating + leaderboard layer for IELTS Reading, modelled on
Chess.com / Codeforces (Elo) and Duolingo (leagues, streaks, achievements).

> Scope: **Reading only**. Reading tests are server-graded from a stored answer
> key, so scores can't be faked — the only skill safe to rank. Listening could
> be added later (it's also auto-graded); writing/speaking are AI-judged and
> deliberately excluded.

---

## 1. Architecture

```
Test taken (iframe)  ─postMessage RESULT─▶  TestRunner (measures duration)
        │
        ▼
  saveResult()  (src/app/actions/results.ts)
        │  1. server-grades from tests.answer_key  (existing)
        │  2. inserts results row (+ duration_seconds)
        │  3. supabase.rpc('apply_rating', { result_id })   ◀── the trusted core
        ▼
  apply_rating()  (SECURITY DEFINER, migration 0016)
        ├─ anti-cheat gating (first-attempt / speed / daily cap / keyed)
        ├─ Elo delta + consistency bonus → profiles.rating / peak_rating
        ├─ weekly/monthly points → results.points
        ├─ self-tunes tests.difficulty
        └─ grants achievements
        ▼
  leaderboard_global / _weekly / _monthly  (SQL views, RLS-safe projection)
        ▼
  /leaderboard page + dashboard RatingCard
```

**One source of truth.** All rating maths lives in `public.apply_rating` (SQL).
`src/lib/rating.ts` is a faithful **mirror** used only for display and unit
tests — a client can never move its own rating through it (RLS + the 0014
trigger reject direct writes to `rating`/`peak_rating`/`rated_count`).

## 2. Rating formula (Elo, per first attempt)

```
expected  = 1 / (1 + 10^((difficulty − rating) / 400))
accuracy  = raw / total                              (0…1)
K         = 48 if provisional (<10 rated)            (placement)
            32 if rating < 2000
            24 if rating < 2400
            16 otherwise
Δ         = round(K · (accuracy − expected))
Δ        ·= consistency   (×1.15 if last-5 mean acc ≥0.75, ×1.05 if ≥0.60)  [gains only]
Δ         = clamp(Δ, −40, +50)
rating   += Δ
```

Matches the brief's examples:

| Scenario | Result |
|---|---|
| 40/40 on a hard test, low-rated player | **+30…+50** |
| 25/40 on a matched test | small gain (~+5) |
| Very poor score on an easy test | rating **decreases** |

**Weekly / monthly points** (always ≥ 1, never negative so boards only grow):

```
points = round( accuracy^1.5 · 100 · clamp(difficulty/1500, 0.6, 1.8) )
```

**Test difficulty** is self-tuning. After ≥5 distinct first attempts:
`difficulty = clamp(1500 + (0.6 − avgFirstAccuracy)·1800, 800, 2600)`.
Tests everyone aces drift toward 800; tests that stump people rise toward 2600.

## 3. Anti-cheat

Enforced entirely in `apply_rating` (server-side, can't be bypassed):

1. **First attempt only.** Re-takes are saved as practice — no rating, no points,
   no leaderboard impact. (Checked by counting prior results for `(user, test)`.)
2. **Score manipulation impossible.** Only tests with a stored `answer_key` are
   rated; the score comes from the server, not the client.
3. **Unrealistically fast runs flagged.** `duration_seconds < max(20, 3·questions)`
   ⇒ `flagged = true`, no rating/points (kept for review).
4. **Farm cap.** Max 15 rated tests per UTC day.
5. **Idempotent.** A result already `rated`/`flagged` is never re-processed
   (plus the existing 30-second duplicate-submit guard in `saveResult`).
6. **Privilege guard.** The 0014 trigger blocks any REST write to rating columns.

Flagged attempts are queryable for review:
`select * from results where flagged order by submitted_at desc;`

## 4. New-user fairness

- Everyone starts at **1000** (Bronze II) with a high provisional **K=48** so
  early results move fast and converge quickly.
- Weekly & monthly boards are **points-based and reset**, so a newcomer can top
  them in week one regardless of all-time rating.
- The global board only lists players with `rated_count > 0`.

## 5. Database (migration `0016_ranking.sql`)

| Object | Purpose |
|---|---|
| `profiles.rating / peak_rating / rated_count` | competitive standing |
| `tests.difficulty` | self-tuning Elo difficulty |
| `results.duration_seconds / rated / points / rating_before/after/delta / flagged / flag_reason` | per-attempt ledger |
| `achievements` + `user_achievements` | catalogue + per-user unlocks (with dates) |
| `apply_rating(result_id)` | the rating engine (SECURITY DEFINER) |
| `recalc_test_difficulty(test_id)` | difficulty maintenance |
| `rebuild_all_ratings()` | replay history; re-run after a formula change |
| `grant_achievement(user, id)` | only writer of `user_achievements` |
| `leaderboard_global / _weekly / _monthly` | RLS-safe public projections |
| `profile_stats` | rich per-user stats (owner-scoped) |

**RLS / security.** The leaderboard views are owned by the migration runner and
run with `security_invoker = off`, intentionally exposing a **safe** projection
(id, name, avatar, rating, points — **never email/auth**) to authenticated users
so a cross-user board is possible. `profile_stats` uses `security_invoker = on`
so it only ever returns the caller's own row. `user_achievements` has a
select-own policy and **no** client insert policy.

### To apply
1. Run `supabase/migrations/0016_ranking.sql` in the Supabase SQL editor.
   It ends by calling `rebuild_all_ratings()` to seed standings from history.
2. (Optional) re-seed any time: `select public.rebuild_all_ratings();`

## 6. API surface

- `saveResult(input)` server action now accepts `durationSeconds` and returns a
  `rating: { rated, rating, delta, points, flagged, reason } | null`.
- `supabase.rpc('apply_rating', { p_result_id })` → standing outcome.
- Read endpoints via supabase-js: `leaderboard_global`, `leaderboard_weekly`,
  `leaderboard_monthly`, `profile_stats`, `achievements`, `user_achievements`.

## 7. Frontend

- `/leaderboard` — Global / Weekly / Monthly tabs, top-3 podium, medal rows,
  tier chips, sticky "your rank" row, ranking-achievements strip (responsive).
- Dashboard `RatingCard` — tier badge, rating, peak, global rank, progress bar,
  and the "*You need 47 rating points to reach Gold*" nudge.
- `RankBadge` / `TierChip` — reusable tier emblems (Bronze … Legend).
- `TestRunner` — live rating delta chip + rating row in the completion modal.
- Tiers: Bronze I–III, Silver I–III, Gold I–III, Platinum I–III, Diamond I–III,
  Master I–III, Grandmaster, Legend (`src/lib/rating.ts`).

## 8. Scaling

- **Reads:** views are simple aggregates over indexed columns
  (`results_rated_idx`, `profiles_rating_idx`). For tens of thousands of users,
  materialise the boards (`create materialized view … ; refresh concurrently`
  on a 1–5 min cron) and serve the top N from there; the live views remain the
  source of truth for a user's own row.
- **Writes:** one extra `apply_rating` RPC per completed test — O(1) plus a small
  bounded recompute of that test's difficulty.
- **Weekly/monthly reset** is implicit (`date_trunc('week'|'month', now())`) — no
  cron, no historical-points wipe needed.
- **Seasons:** add a `season_id` and snapshot final standings per period if you
  want a permanent winners archive.

## 9. Security checklist

- ✅ Rating columns server-only (0014 trigger + RLS).
- ✅ Only keyed, first-attempt reading results are rated (no client trust).
- ✅ Views expose no PII (email/auth excluded by construction).
- ✅ Speed + frequency caps; flagged runs retained for audit.
- ⚠️ Difficulty self-tunes from real data — seed a few honest attempts before a
  test's difficulty is meaningful (defaults to 1500 until ≥5 first attempts).
