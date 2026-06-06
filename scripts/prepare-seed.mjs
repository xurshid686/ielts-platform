// Stages example reading HTML into seed/reading/ with the IELTS scoring bridge injected.
// Run: node scripts/prepare-seed.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const outDir = join(root, "seed", "reading");
mkdirSync(outDir, { recursive: true });

// Source file -> { slug, title, skill, level }
const HOME = "C:/Users/user";
const SOURCES = [
  { file: `${HOME}/Day 16 Passage 3 CDI.html`, slug: "day-16-passage-3", title: "Day 16 — Passage 3", skill: "reading", level: "Band 6–7" },
  { file: `${HOME}/Notes for holiday - CDI.html`, slug: "notes-for-a-holiday", title: "Notes for a Holiday", skill: "reading", level: "Band 5–6" },
];

// Structure-independent bridge: reads the visible final score after submit
// (#reportScore "11/14" or #userScore + optional #bandScore) and reports it.
const BRIDGE = `
<script>
/* IELTS Platform scoring bridge (auto-injected) */
(function () {
  window.reportIELTSResult = window.reportIELTSResult || function (raw, total, band) {
    try {
      parent.postMessage({
        source: "IELTS_CDI_TEST",
        type: "RESULT",
        payload: {
          raw: Number(raw),
          total: Number(total),
          band: band != null && !isNaN(band) ? Number(band) : undefined,
        },
      }, "*");
    } catch (e) { console.error("reportIELTSResult", e); }
  };

  var done = false;

  // Only read the score once the report is actually ON SCREEN. This avoids the
  // default "0/14" placeholder firing on page load or after a cancelled submit.
  function visible(el) {
    return !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
  }
  function tryReport() {
    if (done) return false;
    var el = document.querySelector("#reportScore, #userScore");
    if (!visible(el)) return false;
    var m = el.textContent.match(/(\\d+)\\s*\\/\\s*(\\d+)/);
    if (!m) return false;
    var raw = +m[1], total = +m[2];
    if (!total) return false;
    var b = document.querySelector("#bandScore");
    var band = b ? parseFloat(b.textContent) : NaN;
    done = true;
    window.reportIELTSResult(raw, total, band);
    return true;
  }

  // Primary mechanism: fire when the results modal becomes visible.
  var obs = new MutationObserver(function () { tryReport(); });
  obs.observe(document.documentElement, {
    subtree: true, childList: true, characterData: true,
    attributes: true, attributeFilter: ["class", "style"],
  });

  // Booster: after a submit click, poll briefly (covers the confirm dialog delay).
  document.addEventListener("click", function (e) {
    var t = e.target.closest &&
      e.target.closest('#submitBtn, .btn-submit, #deliver-button, .footer__deliverButton, [onclick*="submit"]');
    if (!t) return;
    var n = 0, iv = setInterval(function () {
      if (tryReport() || ++n > 80) clearInterval(iv);
    }, 200);
  }, true);
})();
</script>
`;

function inject(html) {
  if (html.includes("IELTS Platform scoring bridge")) return html;
  const idx = html.toLowerCase().lastIndexOf("</body>");
  if (idx === -1) return html + BRIDGE;
  return html.slice(0, idx) + BRIDGE + html.slice(idx);
}

const manifest = [];
for (const s of SOURCES) {
  let html;
  try {
    html = readFileSync(s.file, "utf8");
  } catch {
    console.warn(`SKIP (not found): ${s.file}`);
    continue;
  }
  const out = inject(html);
  const outFile = join(outDir, `${s.slug}.html`);
  writeFileSync(outFile, out, "utf8");
  manifest.push({ slug: s.slug, title: s.title, skill: s.skill, level: s.level, path: `seed/reading/${s.slug}.html` });
  console.log(`OK  ${s.title}  ->  ${outFile}`);
}

writeFileSync(join(root, "seed", "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`\nStaged ${manifest.length} file(s). Manifest: seed/manifest.json`);
