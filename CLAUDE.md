@AGENTS.md

# Workflow Rules (IMPORTANT — follow exactly)

## Branches
- ALWAYS work on the `dev` branch. Run `git checkout dev` at the start of every session.
- NEVER commit directly to `main`. `main` is production.
- Never push untested code to `main`.

## Saving & deploying
- After making changes, run: `npm run save-dev`
  - Commits to `dev`, pushes, and deploys a Vercel PREVIEW at https://ielts-platform-dev.vercel.app
  - Optional message: `npm run save-dev -- "what changed"`
- Test every change on the dev preview URL BEFORE going live.
- Only when the user says "go live", run: `npm run go-live`
  - Merges `dev` into `main` and deploys to PRODUCTION (https://ielts-platform-pi.vercel.app).

## General
- All secrets live in `.env.local` (local) and Vercel env vars — never hardcode them.
- Ask before deleting anything.
- Never remove existing features when adding new ones.
- Git auto-deploy is disabled (see vercel.json); deploys happen only via the scripts above.
