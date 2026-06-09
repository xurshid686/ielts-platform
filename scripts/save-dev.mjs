// `npm run save-dev` — commit current work to the dev branch, push it, and
// deploy a Vercel PREVIEW aliased to a stable dev URL for testing.
// Optional commit message: `npm run save-dev -- "what changed"`.
import { execSync } from "node:child_process";

const NAME = "Xurshid";
const EMAIL = "aliqulovxurshid24@gmail.com";
const DEV_ALIAS = "ielts-platform-dev.vercel.app";

const sh = (cmd) => execSync(cmd, { stdio: "inherit" });
const cap = (cmd) => execSync(cmd, { encoding: "utf8" }).toString();

// Always work on dev.
const branch = cap("git rev-parse --abbrev-ref HEAD").trim();
if (branch !== "dev") {
  console.log(`Switching to dev (was ${branch})…`);
  sh("git checkout dev");
}

// Commit any changes.
if (cap("git status --porcelain").trim()) {
  const msg =
    process.argv.slice(2).join(" ") ||
    `dev: update ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;
  sh("git add -A");
  sh(`git -c user.name="${NAME}" -c user.email="${EMAIL}" commit -m ${JSON.stringify(msg)}`);
} else {
  console.log("No file changes to commit.");
}

// Push dev.
sh("git push -u origin dev");

// Deploy a preview and alias it to the stable dev URL.
console.log("\nDeploying dev preview…");
const output = cap("npx vercel deploy --yes");
const url = (output.match(/https:\/\/[a-z0-9-]+\.vercel\.app/gi) || []).pop();
if (url) {
  try {
    sh(`npx vercel alias set ${url} ${DEV_ALIAS}`);
  } catch (e) {
    console.warn("Could not set the dev alias:", e.message);
  }
}

console.log(`\n✅ Saved to dev. Test it here: https://${DEV_ALIAS}`);
if (url) console.log(`   (this exact build: ${url})`);
console.log('When it looks good, run "npm run go-live".');
