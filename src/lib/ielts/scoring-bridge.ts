// The scoring bridge injected into every test served via /api/test-html/[id].
// It reads the test's VISIBLE final score and postMessages it to the platform —
// but ONLY after a real Submit click in the current session. That prevents it
// from re-firing when a finished test is re-opened from saved localStorage state.

export const BRIDGE_MARKER = "IELTS Platform scoring bridge";

export const SCORING_BRIDGE = `
<script>
/* ${BRIDGE_MARKER} (auto-injected by /api/test-html) */
(function () {
  // Harvest the user's answers so the PLATFORM can grade them server-side.
  // CDI tests address every question via input[name="qN"] — text value for
  // completion, the :checked value for MCQ/TF. Returns { "1": "...", ... }.
  function harvestAnswers() {
    var out = {};
    var nodes = document.querySelectorAll('[name^="q"]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var m = (el.name || "").match(/^q(\\d+)$/);
      if (!m) continue;
      var q = m[1];
      if (el.type === "radio" || el.type === "checkbox") {
        if (el.checked) out[q] = el.value;
      } else {
        var v = (el.value || "").trim();
        if (v) out[q] = v;
      }
    }
    return out;
  }

  window.reportIELTSResult = window.reportIELTSResult || function (raw, total, band, answers) {
    try {
      parent.postMessage({
        source: "IELTS_CDI_TEST",
        type: "RESULT",
        payload: {
          // Client-reported score — kept only as a fallback for tests with no
          // stored key. When a key exists the server ignores this and grades
          // 'answers' itself, so the score cannot be faked.
          raw: Number(raw),
          total: Number(total),
          band: band != null && !isNaN(band) ? Number(band) : undefined,
          answers: answers || harvestAnswers(),
        },
      }, "*");
    } catch (e) { console.error("reportIELTSResult", e); }
  };

  var done = false;
  // Only report after a genuine Submit click in THIS session. A re-opened,
  // already-finished test restores its score from storage with NO click, so
  // it will never be re-reported.
  var submitted = false;
  var polling = false;

  function visible(el) {
    return !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
  }
  function readScore() {
    var el = document.querySelector("#reportScore, #userScore, #finalScore, [data-ielts-score]");
    if (!visible(el)) return null;
    var m = (el.textContent || "").match(/(\\d+)\\s*\\/\\s*(\\d+)/);
    if (!m) return null;
    var total = +m[2];
    if (!total) return null;
    return { raw: +m[1], total: total };
  }
  function readBand() {
    var b = document.querySelector("#bandScore, [data-ielts-band]");
    if (!b) return NaN;
    var bm = (b.textContent || "").match(/(\\d+(?:\\.\\d+)?)/);
    return bm ? parseFloat(bm[1]) : NaN;
  }

  // The report fills the score in AFTER the modal becomes visible, and may show a
  // "0/total" placeholder first. So we wait for the value to hold steady (~0.6s)
  // before reporting — that locks onto the final number, not the placeholder.
  function startPolling() {
    if (polling || done || !submitted) return;
    polling = true;
    var lastSig = null, stable = 0, ticks = 0;
    var iv = setInterval(function () {
      if (done) { clearInterval(iv); return; }
      ticks++;
      var s = readScore();
      if (!s) { lastSig = null; stable = 0; if (ticks > 140) clearInterval(iv); return; }
      var sig = s.raw + "/" + s.total;
      if (sig === lastSig) stable++; else { lastSig = sig; stable = 1; }
      if (stable >= 4) {
        done = true;
        clearInterval(iv);
        window.reportIELTSResult(s.raw, s.total, readBand());
      } else if (ticks > 140) {
        clearInterval(iv);
      }
    }, 150);
  }

  document.addEventListener("click", function (e) {
    var t = e.target.closest &&
      e.target.closest('#submitBtn, .btn-submit, #deliver-button, .footer__deliverButton, [onclick*="submit"], [onclick*="Submit"]');
    if (!t) return;
    submitted = true;
    setTimeout(startPolling, 300); // let any confirm() dialog resolve first
  }, true);

  // Backup trigger in case the report appears via a path we didn't catch.
  var obs = new MutationObserver(function () { if (submitted) startPolling(); });
  obs.observe(document.documentElement, {
    subtree: true, childList: true, characterData: true,
    attributes: true, attributeFilter: ["class", "style"],
  });
})();
</script>
`;

/**
 * Strips any previously-injected bridge, then injects the current one, so the
 * served HTML always carries the latest scoring logic (single source of truth).
 */
export function injectScoringBridge(html: string): string {
  const cleaned = html.replace(
    /<script>[\s\S]*?IELTS Platform scoring bridge[\s\S]*?<\/script>/gi,
    "",
  );
  const idx = cleaned.toLowerCase().lastIndexOf("</body>");
  if (idx === -1) return cleaned + SCORING_BRIDGE;
  return cleaned.slice(0, idx) + SCORING_BRIDGE + cleaned.slice(idx);
}
