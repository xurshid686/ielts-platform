// Regenerates src/types/supabase.ts from the LIVE schema.
//
//   SUPABASE_ACCESS_TOKEN=<personal access token> npm run types
//
// Why this wrapper rather than piping the CLI straight into the file:
//
//   1) The generated file needs a DO-NOT-EDIT banner, and a bare `>` redirect
//      would strip it on every regeneration — so the one instruction telling
//      you not to hand-edit the file would be the first casualty of running it.
//   2) A failed generation must not truncate the existing types. `>` opens the
//      file for writing before the CLI runs, so a network blip or an expired
//      token would leave an empty file and a build that fails everywhere. This
//      writes only after the generator exits 0 with plausible output.
//
// The token is a Supabase PERSONAL ACCESS TOKEN (sbp_…). It is read from the
// environment and never written to disk.
import { execSync } from "node:child_process";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "src", "types", "supabase.ts");
const PROJECT_ID = "llzljrwxvpijbfclhlmc"; // Frankfurt — the project production reads

const BANNER = `// GENERATED FILE — DO NOT EDIT BY HAND.
//
// Source of truth: the live Frankfurt project's schema.
// Regenerate after every migration:
//
//   SUPABASE_ACCESS_TOKEN=<token> npm run types
//
// The app-facing aliases (Profile, Test, Result, …) live in ./database.ts and
// are DERIVED from the Row types here, so a schema change surfaces as a type
// error at the point that uses it rather than as a silent wrong assumption.

`;

if (!process.env.SUPABASE_ACCESS_TOKEN) {
  console.error(
    "No SUPABASE_ACCESS_TOKEN.\n" +
      "Create a personal access token at https://supabase.com/dashboard/account/tokens\n" +
      "then run:  SUPABASE_ACCESS_TOKEN=sbp_... npm run types",
  );
  process.exit(1);
}

console.log(`→ generating types from project ${PROJECT_ID}`);

let generated;
try {
  // `shell: true` (via execSync) because Node cannot spawn a Windows .cmd
  // shim directly — execFileSync("npx.cmd") throws EINVAL. Every part of this
  // command is a constant declared above, so there is nothing to inject.
  generated = execSync(
    `npx --yes supabase@latest gen types typescript --project-id ${PROJECT_ID}`,
    { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, stdio: ["ignore", "pipe", "inherit"] },
  );
} catch (e) {
  console.error(`Generation failed; ${OUT} left untouched.\n${e.message}`);
  process.exit(1);
}

// Guard against a "successful" run that produced an error payload or nothing.
if (!generated.includes("export type Database") || generated.length < 1000) {
  console.error(
    `Generator returned something that isn't a schema (${generated.length} bytes); ` +
      `${OUT} left untouched.\n${generated.slice(0, 300)}`,
  );
  process.exit(1);
}

const before = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
const next = BANNER + generated;
writeFileSync(OUT, next);

if (before === next) {
  console.log("✓ types are already up to date");
} else {
  console.log(`✓ wrote ${OUT}`);
  console.log("  Run `npx tsc --noEmit` — a schema change shows up as a type error.");
  console.log("  If a migration you were waiting on is now applied, delete its");
  console.log("  entry from PendingFunctions in src/types/database.ts.");
}
