// `npm run go-live` — merge the tested dev branch into main and deploy to
// PRODUCTION. Refuses to run with uncommitted changes (save-dev first).
import { execSync } from "node:child_process";

const NAME = "Xurshid";
const EMAIL = "aliqulovxurshid24@gmail.com";
const PROD_URL = "https://ielts-platform-pi.vercel.app";

const sh = (cmd) => execSync(cmd, { stdio: "inherit" });
const cap = (cmd) => execSync(cmd, { encoding: "utf8" }).toString();

if (cap("git status --porcelain").trim()) {
  console.error("✋ You have uncommitted changes. Run `npm run save-dev` first.");
  process.exit(1);
}

// Ensure dev is pushed, then fast-forward main to dev.
sh("git checkout dev");
sh("git push origin dev");
sh("git checkout main");
sh("git pull --ff-only origin main");
sh(`git -c user.name="${NAME}" -c user.email="${EMAIL}" merge dev --no-edit`);
sh("git push origin main");

// Deploy production.
console.log("\nDeploying to PRODUCTION…");
sh("npx vercel deploy --prod --yes");

// Back to dev for continued work.
sh("git checkout dev");
console.log(`\n🚀 Live: ${PROD_URL}`);
