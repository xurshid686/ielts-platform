// Sanitizes a CDI test's HTML for the PUBLIC (no-login) serving path.
//
// A public test is taken by anonymous visitors and graded SERVER-SIDE from the
// key stored on the `tests` row. So the browser must never receive the answer
// key, the acceptable-answer variants, the explanations, or the evidence
// snippets — and it must not offer a way to download the file. This strips all
// of that and swaps the in-page scoring for a bridge that only reports the
// user's raw answers to the parent window.
//
// NOTE (told to the user): the passage & question TEXT must remain in the DOM to
// render, so that text is still technically copyable. What this fully protects
// is the answer key / explanations / evidence / band logic and the file itself
// (no PDF button, no static .html URL — it is served only through this route).

import { sliceObjectLiteral } from "./extract-key";
import { HARVEST_ANSWERS_JS } from "./scoring-bridge";

export const PUBLIC_BRIDGE_MARKER = "IELTS Platform public bridge";

// The JS object literals that reveal the key / model answers. Each is replaced
// with an empty object so the test's own scripts still parse and run.
const SENSITIVE_IDENTS = ["correctAnswers", "acceptableAnswers", "explanations", "evidence"];

/**
 * Replaces the `<ident> = { … }` DECLARATION with `<ident> = {}` for each
 * sensitive literal. The CDI format declares each of these exactly once (before
 * any usage), so we blank the first assignment only — later `ident[q]` reads
 * then resolve to undefined against the now-empty object, which is harmless.
 */
function stripSensitiveLiterals(html: string): string {
  let out = html;
  for (const ident of SENSITIVE_IDENTS) {
    const body = sliceObjectLiteral(out, ident);
    if (!body || body === "{}") continue;
    // Locate the exact `{` that starts this literal (first `{` after `ident =`),
    // so we blank THIS block rather than the first identical-looking one.
    const assign = new RegExp(`${ident}\\s*=`).exec(out);
    if (!assign) continue;
    const open = out.indexOf("{", assign.index + assign[0].length);
    if (open < 0) continue;
    out = out.slice(0, open) + "{}" + out.slice(open + body.length);
  }
  return out;
}

/**
 * Removes the html2pdf library <script>. That alone disables PDF export: the
 * test's own code guards every use with `typeof html2pdf === 'undefined'` and
 * bails out, so nothing crashes. We deliberately do NOT rewrite the html2pdf()
 * / window.print() call sites — doing so produced invalid JS (e.g. `void 0.set`
 * → `0.` is a number literal, a syntax error) that killed the whole script.
 */
function stripDownloadTools(html: string): string {
  return html.replace(/<script[^>]*html2pdf[^>]*>\s*<\/script>/gi, "");
}

// Injected AFTER the test's own scripts (before </body>), so its function
// declarations already exist and can be overridden. It: hides the in-iframe
// result report, no-ops the on-page correctness painting (which would show
// wrong marks now that the key is empty), and — on a genuine Submit — reports
// the harvested answers to the parent for server-side grading.
const PUBLIC_BRIDGE = `
<script>
/* ${PUBLIC_BRIDGE_MARKER} (auto-injected by /api/public-test-html) */
(function () {
${HARVEST_ANSWERS_JS}

  // Belt-and-suspenders: hide the test's own result report + retake button.
  try {
    var css = document.createElement("style");
    css.textContent = "#submissionModal{display:none!important}#headerRetakeBtn{display:none!important}#printReportBtn,#copyReportBtn{display:none!important}";
    (document.head || document.documentElement).appendChild(css);
  } catch (e) {}

  var posted = false;
  function publicSubmit() {
    if (posted) return;
    posted = true;
    try {
      parent.postMessage({
        source: "IELTS_CDI_TEST",
        type: "PUBLIC_SUBMIT",
        payload: { answers: harvestAnswers() },
      }, "*");
    } catch (e) {}
  }

  // Override the test's result rendering. showResults() (no arg) = a fresh
  // submit → report answers to the parent. showResults(true) = a storage
  // restore on load → do NOT re-report. Never call the original: with the key
  // stripped it would render a wrong 0/N report.
  try { window.markOnPage = function () {}; } catch (e) {}
  try {
    window.showResults = function (hideModal) {
      if (!hideModal) publicSubmit();
    };
  } catch (e) {}

  // Best-effort anti-copy / anti-download deterrents (a determined user with
  // devtools can still read the passage text — see the note at the top). We must
  // NOT block "selectstart" (the highlight tool needs text selection) or
  // "dragstart" (drag-and-drop answers), so we only guard copy/cut and the menu.
  ["contextmenu", "copy", "cut"].forEach(function (ev) {
    document.addEventListener(ev, function (e) { e.preventDefault(); }, true);
  });
  document.addEventListener("keydown", function (e) {
    var k = (e.key || "").toLowerCase();
    if ((e.ctrlKey || e.metaKey) && ["s", "p", "u"].indexOf(k) > -1) e.preventDefault();
    if (k === "f12") e.preventDefault();
  }, true);
})();
</script>
`;

/**
 * Full public sanitization pipeline: strip the key/explanations/evidence, remove
 * the download tools, then inject the public bridge before </body>.
 */
export function sanitizePublicTestHtml(html: string): string {
  let out = stripSensitiveLiterals(html);
  out = stripDownloadTools(out);
  const idx = out.toLowerCase().lastIndexOf("</body>");
  if (idx === -1) return out + PUBLIC_BRIDGE;
  return out.slice(0, idx) + PUBLIC_BRIDGE + out.slice(idx);
}
