// The one place a script decides WHICH DATABASE it is about to touch.
//
// ---------------------------------------------------------------------------
// Why this exists
// ---------------------------------------------------------------------------
// Every script in this directory used to carry its own copy of an eight-line
// parser that hardcoded `.env.local`. There are two Supabase projects, and
// `.env.local` points at the OLD, DEAD one — production reads the Frankfurt
// project (see CLAUDE.md). So `npm run seed`, `backfill:keys` and the answer-key
// audit all connected to a database nothing serves, did their work, and
// reported success. Nothing in the output said which project it had been
// talking to.
//
// This module makes the target explicit and prints it, every run.
//
// ---------------------------------------------------------------------------
// Choosing a target
// ---------------------------------------------------------------------------
//   node scripts/audit-answer-keys.mjs                  -> live (.env.frankfurt)
//   node scripts/audit-answer-keys.mjs --env=local      -> .env.local
//   IELTS_ENV=local node scripts/audit-answer-keys.mjs  -> same
//
// The default is the LIVE project, because every script here is a maintenance
// tool for the real catalogue. That is a deliberate choice and the reason the
// target host is printed on every run: silence is what made the old default
// dangerous, not the default itself.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const TARGETS = {
  live: ".env.frankfurt",
  frankfurt: ".env.frankfurt",
  local: ".env.local",
  digitalocean: ".env.digitalocean",
};

function parse(file) {
  const out = {};
  const txt = readFileSync(join(root, file), "utf8");
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    // Strip one layer of surrounding quotes, if present.
    out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return out;
}

/**
 * Loads the chosen env file into process.env and returns the resolved config.
 *
 * Real environment variables always win, so CI can set them directly without
 * an env file present.
 *
 * @param {{ requireServiceRole?: boolean, quiet?: boolean }} [opts]
 */
export function loadEnv(opts = {}) {
  const { requireServiceRole = true, quiet = false } = opts;

  const flag = process.argv.find((a) => a.startsWith("--env="));
  const name = (flag ? flag.slice("--env=".length) : process.env.IELTS_ENV || "live")
    .trim()
    .toLowerCase();

  const file = TARGETS[name];
  if (!file) {
    console.error(
      `Unknown --env=${name}. Use one of: ${Object.keys(TARGETS).join(", ")}.`,
    );
    process.exit(1);
  }

  let parsed = {};
  try {
    parsed = parse(file);
  } catch {
    // Not fatal on its own — the variables may already be in the environment.
  }
  for (const [k, v] of Object.entries(parsed)) {
    if (!process.env[k]) process.env[k] = v;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url) {
    console.error(
      `No NEXT_PUBLIC_SUPABASE_URL. Expected it in ${file} or the environment.`,
    );
    process.exit(1);
  }
  if (requireServiceRole && !serviceKey) {
    console.error(
      `No SUPABASE_SERVICE_ROLE_KEY. Expected it in ${file} or the environment.`,
    );
    process.exit(1);
  }

  // Always say which database this run is about to touch. Never print a key.
  if (!quiet) {
    const host = (() => {
      try {
        return new URL(url).host;
      } catch {
        return url;
      }
    })();
    console.log(`→ target: ${name} (${file})  ${host}\n`);
  }

  return { name, file, url, serviceKey, anonKey };
}
