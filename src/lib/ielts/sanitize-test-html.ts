// Sanitizes a CDI test's HTML for EVERY serving path (see /api/test-html/[id]).
//
// The browser must never receive the answer key, the acceptable-answer variants,
// the explanations, or the evidence snippets — those are the paid product, and
// until this ran on the authenticated path too, any signed-in user could read
// the whole premium library out of devtools. Grading is therefore done
// SERVER-SIDE from the key stored on the `tests` row; the page only reports the
// user's raw answers upward.
//
// NOTE (told to the user): the passage & question TEXT must remain in the DOM to
// render, so that text is still technically copyable. What this fully protects
// is the answer key / explanations / evidence / band logic and the file itself
// (no PDF button, no static .html URL — it is served only through the route).
//
// The source CDI files in storage are never modified; this is a transform
// applied to the response body on the way out.

import { HARVEST_ANSWERS_JS } from "./scoring-bridge";

export const SANITIZED_BRIDGE_MARKER = "IELTS Platform sanitized bridge";

// The JS object literals that reveal the key / model answers. Each is replaced
// with an empty object so the test's own scripts still parse and run.
//
// The two CDI formats name these differently, so BOTH sets are listed and any
// that are absent are simply skipped:
//   reading   — correctAnswers, acceptableAnswers, explanations, evidence
//   listening — KEY, evidence   (the listening builds have no correctAnswers at
//               all, so matching only the reading names left every listening
//               test shipping its full key)
const SENSITIVE_IDENTS = [
  "correctAnswers",
  "acceptableAnswers",
  "explanations",
  "evidence",
  "KEY",
];

/**
 * Finds the index of the `{` that opens `<ident> = { … }`.
 *
 * The match is deliberately strict — the identifier must not be part of a
 * longer name or a property access, and the `{` must follow the `=` with only
 * whitespace between. A looser `ident\s*=` search matched prose inside a
 * banner comment ("transcript evidence ==========") and then blanked whatever
 * `{` came next, which silently gutted an unrelated function while leaving the
 * real key untouched.
 */
function findLiteralOpen(src: string, ident: string, from = 0): number {
  const re = new RegExp(`(?:^|[^\\w$.])${ident}\\s*=\\s*\\{`, "g");
  re.lastIndex = from;
  const m = re.exec(src);
  if (!m) return -1;
  return src.indexOf("{", m.index);
}

/** Index just past the `}` that closes the literal opened at `open`, or -1. */
function findLiteralEnd(src: string, open: number): number {
  let depth = 0;
  let inStr = false;
  let quote = "";
  let esc = false;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === quote) inStr = false;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") {
      inStr = true;
      quote = c;
    } else if (c === "{") {
      depth++;
    } else if (c === "}") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

/**
 * Replaces the `<ident> = { … }` DECLARATION with `<ident> = {}` for each
 * sensitive literal — every occurrence, not just the first, so a format that
 * declares one of them twice can't slip a copy through. Later `ident[q]` reads
 * then resolve to undefined against the now-empty object, which is harmless.
 */
function stripSensitiveLiterals(html: string): string {
  let out = html;
  for (const ident of SENSITIVE_IDENTS) {
    let searchFrom = 0;
    for (;;) {
      const open = findLiteralOpen(out, ident, searchFrom);
      if (open < 0) break;
      const end = findLiteralEnd(out, open);
      if (end < 0) break; // unbalanced — leave it rather than corrupt the file
      if (end - open <= 2) {
        searchFrom = end; // already `{}`
        continue;
      }
      out = out.slice(0, open) + "{}" + out.slice(end);
      searchFrom = open + 2;
    }
  }
  return out;
}

/**
 * Every sensitive identifier that STILL has a non-empty literal after
 * stripSensitiveLiterals() ran — i.e. the names it failed to blank.
 *
 * This exists because stripping fails OPEN. `findLiteralEnd` walks braces with
 * only string-literal awareness: it knows nothing about `//` comments or regex
 * literals, so a stray apostrophe in a comment INSIDE one of these objects
 * ("// don't change") flips it into string mode, the closing brace is never
 * found, and the loop hits `break` — deliberately, because leaving the literal
 * alone beats corrupting the file. The consequence is that the key survives
 * into the served HTML while /api/test-html still believes it sanitized the
 * file and audit-answer-keys.mjs still passes, because that script only ever
 * inspects the database column and never the bytes actually sent.
 *
 * So the served output is checked instead, and a failure refuses to serve.
 *
 * Unlike extractSensitiveLiterals() this scans EVERY occurrence, not just the
 * first, so a file that declares one of these twice cannot leave a second copy
 * behind unnoticed.
 */
export function findUnstrippedLiterals(html: string): string[] {
  const found: string[] = [];
  for (const ident of SENSITIVE_IDENTS) {
    let searchFrom = 0;
    for (;;) {
      const open = findLiteralOpen(html, ident, searchFrom);
      if (open < 0) break;
      const end = findLiteralEnd(html, open);
      if (end < 0) {
        // Unbalanced: the brace walk lost its place, so whatever follows was
        // never blanked. Exactly the case this guard is here to catch.
        found.push(ident);
        break;
      }
      if (end - open > 2) {
        found.push(ident);
        break;
      }
      searchFrom = end;
    }
  }
  return found;
}

/**
 * The source text of each sensitive literal, as it appears in the file:
 *
 *   { correctAnswers: "{14:'visual memory', 15:'migration direction', …}", … }
 *
 * Returned as raw JS source rather than parsed data on purpose. The library
 * contains two CDI generations with different shapes — one uses
 * `evidence[q].snippet` with a separate `acceptableAnswers`, the older one uses
 * `evidence[q].text` and array-valued `correctAnswers` — and handing back
 * exactly what was removed means the page gets its own shape back with no
 * per-format adapter to keep in sync.
 *
 * This is what /api/test-key serves once a student has submitted, so the test's
 * own results screen can run exactly as it does in the standalone file.
 */
export function extractSensitiveLiterals(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const ident of SENSITIVE_IDENTS) {
    const open = findLiteralOpen(html, ident);
    if (open < 0) continue;
    const end = findLiteralEnd(html, open);
    if (end < 0) continue;
    const body = html.slice(open, end);
    if (body.replace(/\s/g, "") === "{}") continue; // nothing worth sending
    out[ident] = body;
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
/**
 * Points a test's intro-video gate at this platform's own gated route.
 *
 * A test built with `mock-intro-video` carries `__TEST_VIDEO_SRC__` and falls
 * back to a public URL when nothing replaces it, so the standalone file still
 * works on its own. Served from here it gets `/api/test-video/<id>` instead,
 * which applies the same entitlement check as the test — the video for a premium
 * test is then unreachable without a membership, and there is no shareable link.
 *
 * A file without the placeholder is left untouched, so this is safe for the
 * whole existing library.
 */
function pointVideoAtGatedRoute(html: string, origin: string, testId: string): string {
  return html.replaceAll(
    "__TEST_VIDEO_SRC__",
    `${origin}/api/test-video/${encodeURIComponent(testId)}`,
  );
}

function stripDownloadTools(html: string): string {
  return html.replace(/<script[^>]*html2pdf[^>]*>\s*<\/script>/gi, "");
}

// Injected AFTER the test's own scripts (before </body>), so its function
// declarations already exist and can be captured.
//
// The job here is DEFERRAL, not suppression. The answer key is absent while the
// student works, so the test's own results code would render a wrong 0/N — but
// the moment they submit, the key is fetched, poured back into the objects it
// was stripped from, and the test's OWN report is run. The student sees the
// same screen the standalone file gives them: score, band, per-question marking,
// explanations, and the evidence highlighted in the passage.
//
// This works because those objects are top-level `const` in a CLASSIC script.
// A const binding cannot be reassigned and is not a property of `window`, but
// it IS visible by name to a later classic script in the same document, and the
// empty object left behind is mutable. So `Object.assign(correctAnswers, …)`
// reaches every function that reads it. `window.correctAnswers = …` would not.
//
// `__ORIGIN__` is substituted with the site origin so postMessage is never
// broadcast with a wildcard target. `__TEST_ID__` is the id to fetch the key by.
const SANITIZED_BRIDGE = `
<script>
/* ${SANITIZED_BRIDGE_MARKER} (auto-injected by /api/test-html) */
(function () {
${HARVEST_ANSWERS_JS}

  var TARGET_ORIGIN = "__ORIGIN__";
  var TEST_ID = "__TEST_ID__";

  // Hide the report while the key is absent — it could only render a wrong 0/N.
  // Removed again the instant the real data arrives.
  var hideStyle = null;
  try {
    hideStyle = document.createElement("style");
    // #printReportBtn stays hidden for good: the html2pdf library is stripped
    // from the file, so that button would silently do nothing.
    hideStyle.textContent = "#submissionModal{display:none!important}#headerRetakeBtn{display:none!important}#printReportBtn{display:none!important}";
    (document.head || document.documentElement).appendChild(hideStyle);
  } catch (e) {}

  function unhideReport() {
    try { if (hideStyle && hideStyle.parentNode) hideStyle.parentNode.removeChild(hideStyle); } catch (e) {}
    try {
      var keepPdfHidden = document.createElement("style");
      keepPdfHidden.textContent = "#printReportBtn{display:none!important}";
      (document.head || document.documentElement).appendChild(keepPdfHidden);
    } catch (e) {}
  }

  // Capture the test's own renderers BEFORE overriding them. These are function
  // declarations, so unlike the const data they really are on window.
  var origShowResults = typeof window.showResults === "function" ? window.showResults : null;
  var origMarkOnPage = typeof window.markOnPage === "function" ? window.markOnPage : null;

  var posted = false;
  function reportSubmit() {
    if (posted) return;
    posted = true;
    try {
      parent.postMessage({
        source: "IELTS_CDI_TEST",
        type: "SUBMIT",
        payload: { answers: harvestAnswers() },
      }, TARGET_ORIGIN);
    } catch (e) { console.error("reportSubmit", e); }
  }

  // Pour the fetched literals back into the objects they were stripped from.
  // Each name is guarded: a file that never declared one must not throw a
  // ReferenceError and lose the rest.
  function seed(literals) {
    function put(name, src) {
      if (!src) return;
      var value;
      try { value = new Function("return (" + src + ")")(); } catch (e) { return; }
      try {
        if (name === "correctAnswers" && typeof correctAnswers !== "undefined") Object.assign(correctAnswers, value);
        else if (name === "acceptableAnswers" && typeof acceptableAnswers !== "undefined") Object.assign(acceptableAnswers, value);
        else if (name === "explanations" && typeof explanations !== "undefined") Object.assign(explanations, value);
        else if (name === "evidence" && typeof evidence !== "undefined") Object.assign(evidence, value);
        else if (name === "KEY" && typeof KEY !== "undefined") Object.assign(KEY, value);
      } catch (e) {}
    }
    put("correctAnswers", literals.correctAnswers);
    put("acceptableAnswers", literals.acceptableAnswers);
    put("explanations", literals.explanations);
    put("evidence", literals.evidence);
    put("KEY", literals.KEY);
  }

  // Fetches the stripped literals once and caches the result. Resolves with null
  // (never rejects) when the key can't be had, and forgets a null so a later
  // attempt can retry.
  var literalsPromise = null;
  function fetchLiterals() {
    if (!literalsPromise) {
      literalsPromise = fetch("/api/test-key/" + TEST_ID, { credentials: "same-origin" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          var lit = data && data.literals ? data.literals : null;
          if (!lit) literalsPromise = null;
          return lit;
        })
        .catch(function () { literalsPromise = null; return null; });
    }
    return literalsPromise;
  }

  var restored = false;
  // Fetches the key, seeds it, hands rendering back to the test's own code and
  // runs it. \`hideModal\` mirrors the test's own argument: false = a fresh
  // submit (pop the report), true = restoring an already-finished session.
  function restoreAndRender(hideModal) {
    if (restored) return;
    restored = true;
    fetchLiterals().then(function (literals) {
      if (!literals) {
        // Couldn't get the key: leave the report hidden rather than show a
        // broken 0/N. The platform still grades and saves the attempt, and the
        // student gets the full breakdown on the review page.
        restored = false;
        return;
      }
      seed(literals);
      unhideReport();
      if (origMarkOnPage) window.markOnPage = origMarkOnPage;
      if (origShowResults) window.showResults = origShowResults;
      try { if (origMarkOnPage) origMarkOnPage(); } catch (e) {}
      try { if (origShowResults) origShowResults(hideModal); } catch (e) {}
    });
  }

  // Intercept the test's result rendering. showResults() with no argument is a
  // fresh submit; showResults(true) is a storage restore, which must not be
  // reported to the parent a second time.
  try { window.markOnPage = function () {}; } catch (e) {}
  try {
    window.showResults = function (hideModal) {
      if (!hideModal) reportSubmit();
      restoreAndRender(!!hideModal);
    };
  } catch (e) {}

  // ---- Shells that grade inside their OWN submit handler (the listening player)
  //
  // The reading shells route every result through showResults(), which is
  // overridden above, so their grading never touches the blanked key. The
  // listening player has no showResults() at all: #doSubmit grades inline and
  // reads KEY[q] directly, so with KEY blanked to {} the very first answered
  // question threw "Cannot read properties of undefined (reading 'map')" inside
  // isCorrect(). The handler died there — testSubmitted was never set, the
  // results panel never opened, and the click fallback below (which trusts that
  // flag to tell a real submit from merely opening the review overlay) bailed
  // out. Nothing was posted to the parent, so NO listening attempt was ever
  // graded or saved.
  //
  // Fix: for those shells, pour the key back BEFORE the test's own handler runs,
  // then let it grade itself exactly as it does standalone, and use its own
  // testSubmitted flag to decide whether to report the attempt (so a submit the
  // student cancels at the "you have N unanswered" confirm is not reported).
  var ownSubmitWrapped = false;
  var ownSubmitBusy = false;
  function wrapOwnSubmit() {
    if (ownSubmitWrapped || origShowResults) return; // showResults shells are already handled
    var btn = document.getElementById("doSubmit");
    if (!btn || typeof btn.onclick !== "function") return;
    var orig = btn.onclick;
    ownSubmitWrapped = true;
    btn.onclick = function (opts) {
      var self = this;
      var args = arguments;
      // The key arrives asynchronously and the button is not disabled while it
      // is in flight, so a double-click would queue a second callback and grade
      // the paper twice (duplicate rows in the review table).
      if (ownSubmitBusy) return;
      ownSubmitBusy = true;
      fetchLiterals().then(function (literals) {
        var seeded = false;
        if (literals) {
          seed(literals);
          seeded = true;
        }
        var threw = false;
        try { orig.apply(self, args); } catch (e) { threw = true; console.error("submit", e); }
        var flagged = true;
        try { if (typeof testSubmitted !== "undefined") flagged = !!testSubmitted; } catch (e) {}
        // No key available: the test's own grading throws before it can set its
        // flag, but the student did click through the confirm — report anyway so
        // the server still grades and saves the attempt. They get the breakdown
        // on the review page instead of the in-page report.
        if (flagged || (!seeded && threw)) {
          reportSubmit();
          // Only reveal the report once the submit actually went through — the
          // student can back out at the shell's "you still have N unanswered"
          // confirm, and that must not leave them looking at the answers.
          unhideReport();
        } else {
          ownSubmitBusy = false; // cancelled at the confirm — allow a retry
        }
      });
    };
  }
  wrapOwnSubmit();
  // A shell that assigns #doSubmit.onclick from DOMContentLoaded / window.onload
  // has not done so yet at this point. Both retries are no-ops once wrapped.
  document.addEventListener("DOMContentLoaded", wrapOwnSubmit);
  window.addEventListener("load", wrapOwnSubmit);

  // Fallback for any CDI build that submits through a path other than
  // showResults(). Both reportSubmit() and restoreAndRender() are idempotent,
  // so it is harmless when showResults() also fires.
  //
  // CRITICAL: this must not fire on a button that merely OPENS the review
  // overlay. In this shell #deliver-button does exactly that — it calls
  // openReviewPage(), and the real submit is #reviewSubmit inside the overlay.
  // Treating the deliver click as a submit fetched the answer key and rendered
  // the report while the student was still able to go back and change answers.
  //
  // So the click only arms the fallback; the test's own testSubmitted flag
  // decides whether a submission actually happened. Shells that don't define
  // that flag fall back to the old timing-based behaviour.
  function armFallback() {
    setTimeout(function () {
      try {
        if (typeof testSubmitted !== "undefined" && !testSubmitted) return; // review overlay, not a submit
      } catch (e) {}
      reportSubmit();
      restoreAndRender(false);
    }, 600);
  }

  document.addEventListener("click", function (e) {
    var t = e.target.closest &&
      e.target.closest('#submitBtn, .btn-submit, #reviewSubmit, #deliver-button, ' +
        '.footer__deliverButton, #doSubmit, #footerSubmit, .big-submit, .submit-btn, ' +
        '[onclick*="submit"], [onclick*="Submit"]');
    if (!t) return;
    armFallback();
  }, true);

  // A session that was ALREADY submitted has a problem this bridge cannot
  // prevent: the test's loadState() runs at the end of its own script, before
  // this one exists, so it has already painted an empty report from the blanked
  // key. Re-render it properly, without re-reporting the attempt.
  try {
    if (typeof testSubmitted !== "undefined" && testSubmitted) {
      posted = true; // this is not a new submission
      restoreAndRender(true);
    }
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
 * Thrown when the strip left a key behind. Callers must NOT serve the html —
 * see /api/test-html, which turns this into a 502.
 */
export class SanitizeIncompleteError extends Error {
  constructor(readonly idents: string[]) {
    super(`answer key not fully stripped: ${idents.join(", ")}`);
    this.name = "SanitizeIncompleteError";
  }
}

/**
 * Full sanitization pipeline: strip the key/explanations/evidence, remove the
 * download tools, then inject the bridge before </body>.
 *
 * `origin` is the site origin used as the postMessage target. Pass the request's
 * own origin so the message is never broadcast with "*".
 * `testId` is the id the bridge fetches the key back with once the student
 * submits, so the test's own results screen can run.
 *
 * THROWS SanitizeIncompleteError if any sensitive literal survived. This fails
 * closed on purpose: a test that will not load is a support ticket, a test that
 * quietly ships its premium answer key is the thing this whole module exists to
 * prevent. See findUnstrippedLiterals() for how the strip can fail.
 */
export function sanitizeTestHtml(html: string, origin: string, testId: string): string {
  let out = stripSensitiveLiterals(html);
  const leftover = findUnstrippedLiterals(out);
  if (leftover.length) throw new SanitizeIncompleteError(leftover);
  out = stripDownloadTools(out);
  out = pointVideoAtGatedRoute(out, origin, testId);
  const bridge = SANITIZED_BRIDGE.replace("__ORIGIN__", origin).replace(
    "__TEST_ID__",
    encodeURIComponent(testId),
  );
  const idx = out.toLowerCase().lastIndexOf("</body>");
  if (idx === -1) return out + bridge;
  return out.slice(0, idx) + bridge + out.slice(idx);
}
