# IELTS Practice Platform — Setup (Phase 1 MVP)

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind v4 · Supabase (Auth + DB + Storage).

## What's included in Phase 1

- ✅ Email/password **and** Google OAuth auth (Supabase Auth, session in cookies)
- ✅ Auto-created profile on first login (email *or* Google) via a DB trigger
- ✅ Role-based access (`student` / `admin`) enforced by `proxy.ts` + RLS
- ✅ Student dashboard: streak 🔥, longest streak, XP, recent results, skill averages
- ✅ Reading + Listening: list tests, take them in a sandboxed iframe, auto-scoring, history/avg/best
- ✅ Streak + XP engine (Postgres function, increments once/day, resets on a missed day)
- ✅ Admin panel: upload/delete HTML tests, view students + analytics
- ✅ Dark / light mode, mobile responsive
- 🔜 Writing, Speaking, Achievements, AI (Phase 2/3) — nav stubs in place

---

## 1. Run the database migration

Open **Supabase Dashboard → SQL Editor → New query**, paste the contents of
`supabase/migrations/0001_init.sql`, and click **Run**.

This creates all tables, RLS policies, the signup trigger, the streak function,
and the `tests` (public) + `speaking` (private) storage buckets.

## 2. Environment variables

`.env.local` is already filled with your project URL + publishable key:

```
NEXT_PUBLIC_SUPABASE_URL=https://cxgwxzkqccpyuhacwvum.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

> No service-role key needed for Phase 1 — admin uploads are gated by RLS.

## 3. Configure Google OAuth

**In Google Cloud Console** (console.cloud.google.com):
1. APIs & Services → Credentials → **Create OAuth client ID** → *Web application*.
2. **Authorized redirect URI**:
   `https://cxgwxzkqccpyuhacwvum.supabase.co/auth/v1/callback`
3. Copy the **Client ID** and **Client secret**.

**In Supabase Dashboard** → Authentication → Providers → **Google**:
1. Enable it, paste the Client ID + secret, save.

**In Supabase Dashboard** → Authentication → URL Configuration:
1. **Site URL**: `http://localhost:3000` (add your Vercel URL in production).
2. **Redirect URLs**: add `http://localhost:3000/**`.

> For quick local testing of email/password without inboxes, you can turn OFF
> "Confirm email" in Authentication → Providers → Email. Turn it back on for production.

## 4. Run it

```bash
npm run dev
```

Open http://localhost:3000 → Register or "Continue with Google".

## 5. Make yourself an admin

After signing in once, run this in the Supabase SQL Editor (use your email):

```sql
update public.profiles set role = 'admin' where email = 'aliqulovxurshid24@gmail.com';
```

Refresh the app — an **Admin** link appears in the sidebar. Go to **Admin → Manage tests** to upload your first HTML test.

---

## 6. How test scoring works (important)

Your Reading/Listening tests are **self-contained HTML** that score themselves.
For a test to report its score to the platform, add the bridge from
`docs/test-scoring-snippet.html` to the HTML (just before `</body>`), and call:

```js
reportIELTSResult(correctCount, totalQuestions, bandScore); // band optional
```

inside your test's existing Submit handler. The platform loads the HTML in a
sandboxed iframe, listens for that message, saves the result, and updates the
streak/XP.

> Tests that don't emit a score still work — the runner shows a **"Score didn't
> save?"** manual entry so nothing is blocked. (Recommended: wire the snippet
> into your CDI generator so every new test is platform-ready automatically.)

---

## 7. Deploy (Vercel)

1. Push to GitHub, import into Vercel.
2. Add the same env vars (set `NEXT_PUBLIC_SITE_URL` to your Vercel domain).
3. Add your Vercel domain to Supabase **Site URL** + **Redirect URLs**, and to the
   Google OAuth authorized origins/redirect.

---

## Security notes

- **Rotate the password** you shared earlier — it's in chat history. Supabase Auth
  manages passwords; this app never stores them.
- RLS is on for every table: students see only their own rows; admins see all;
  only admins can write tests / upload to the `tests` bucket.
- The `tests` bucket is **public-read** so the iframe can load HTML directly. Note
  that self-scoring HTML has its answer key in the page source by design — fine for
  practice. If you later want to hide answers, switch to a private bucket + signed
  URLs + server-side scoring.

## Project map

```
proxy.ts                      # Next 16 session refresh + route protection (was middleware.ts)
supabase/migrations/0001_init.sql
src/lib/supabase/             # client / server / proxy Supabase factories
src/lib/auth.ts               # requireProfile / requireAdmin
src/app/(auth)/               # login, register
src/app/auth/                 # OAuth callback, signout
src/app/(app)/                # dashboard, reading, listening, writing, speaking, admin
src/components/test-runner.tsx# sandboxed iframe + postMessage scoring
src/app/actions/              # saveResult, admin upload/delete (server actions)
```
