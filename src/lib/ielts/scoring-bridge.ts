// The scoring bridge injected into every test served via /api/test-html/[id].
// It reads the test's VISIBLE final score and postMessages it to the platform —
// but ONLY after a real Submit click in the current session. That prevents it
// from re-firing when a finished test is re-opened from saved localStorage state.

export const BRIDGE_MARKER = "IELTS Platform scoring bridge";

// Shared answer-harvesting routine, injected into BOTH the authenticated scoring
// bridge and the public sanitizer's bridge so the two never diverge. Defines a
// `harvestAnswers()` in the enclosing scope. CDI reading tests address every
// question via input[name="qN"]; cdi-listening-master uses data-q / data-qs.
export const HARVEST_ANSWERS_JS = `
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

    // The cdi-listening-master format addresses questions by data-q / data-qs
    // instead of name="qN": text gaps (.gap[data-q]), drag-drop matching
    // (.dropzone[data-q] with the dropped letter in data-value), and "choose TWO
    // letters" checkbox groups (.mcq.multi[data-qs]). Harvest those too.
    var gaps = document.querySelectorAll('input[data-q]');
    for (var g = 0; g < gaps.length; g++) {
      var gv = (gaps[g].value || "").trim();
      if (gv) out[gaps[g].getAttribute("data-q")] = gv;
    }
    var zones = document.querySelectorAll('.dropzone[data-q]');
    for (var z = 0; z < zones.length; z++) {
      var zv = (zones[z].dataset && zones[z].dataset.value) || zones[z].getAttribute("data-value") || "";
      if (zv) out[zones[z].getAttribute("data-q")] = zv;
    }

    // READING drag-and-drop. Unlike the listening .dropzone above, these shells
    // keep the answer on the dropped TOKEN rather than on the zone, and each
    // shell generation names it differently:
    //   matching-headings   .heading-drop[data-q] > .heading-token[data-heading]
    //   drag-token summary  .dd-drop[data-q]      > .dd-token[data-letter]
    //   sentence endings    .ending-drop[data-q]  > .ending-token[data-ending]
    // None was harvested, so on every live test that uses them the platform
    // graded those questions as unanswered while the page showed them correct —
    // a student could see 13/13 and have 7/13 saved.
    //
    // The zone is matched only as "something with a data-q", and the token by a
    // generic fallback as well as the three known names, because chasing one
    // attribute name per generation is exactly how this was missed three times
    // over. out[dq] is never overwritten, so the input readers above still win.
    var drops = document.querySelectorAll("[data-q]");
    for (var d = 0; d < drops.length; d++) {
      var dq = drops[d].getAttribute("data-q");
      if (!dq || out[dq] || !drops[d].querySelector) continue;
      // The token is normally inside the zone, but a shell could equally put
      // data-q on the token itself — then this element IS the token.
      var tok = drops[d].querySelector("[data-heading], [data-letter], [data-ending]") || drops[d];
      var tv =
        tok.getAttribute("data-heading") || tok.getAttribute("data-letter") || tok.getAttribute("data-ending") || "";
      if (!tv) {
        // An unrecognised generation: a dropped token carrying exactly one
        // data-* attribute, which is where every one of these keeps its answer.
        // Bookkeeping attributes are excluded, so neither does a data-index get
        // submitted as an answer, nor does a data-q alongside the real one stop
        // this from finding it.
        var META = ",q,qs,id,idx,index,slot,order,position,num,number,";
        var any = drops[d].querySelector('[class*="token"]');
        var names = [];
        if (any && any.dataset) {
          for (var nk in any.dataset) {
            if (META.indexOf("," + nk.toLowerCase() + ",") < 0) names.push(nk);
          }
        }
        if (names.length === 1) tv = String(any.dataset[names[0]] || "");
      }
      tv = (tv || "").trim();
      if (tv) out[dq] = tv;
    }
    // Each multi group fills its question slots with the SORTED selected letters
    // (q[0] = first letter, q[1] = second), matching the test's in-page grading.
    // Two generations name this group differently: the listening shell uses
    // .mcq.multi[data-qs]="21,22", the reading shell .mcq-block[data-mcq-group]
    // with a RANGE ("18-19"). Reading's slots were never harvested, so every
    // "choose TWO letters" question in those files saved as unanswered.
    var groups = document.querySelectorAll('.mcq.multi[data-qs], [data-mcq-group]');
    for (var k = 0; k < groups.length; k++) {
      var spec = groups[k].getAttribute("data-qs") || groups[k].getAttribute("data-mcq-group") || "";
      var qs = spec.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
      // Expand an "a-b" range into every question number it covers.
      if (qs.length === 1) {
        var rm = qs[0].match(/^(\\d+)\\s*[-\\u2013\\u2014]\\s*(\\d+)$/);
        if (rm) {
          qs = [];
          for (var r = Number(rm[1]); r <= Number(rm[2]); r++) qs.push(String(r));
        }
      }
      var boxes = groups[k].querySelectorAll('input[type="checkbox"]');
      var picked = [];
      for (var b = 0; b < boxes.length; b++) if (boxes[b].checked) picked.push(boxes[b].value);
      picked.sort();
      for (var p = 0; p < qs.length; p++) if (picked[p]) out[qs[p]] = picked[p];
    }
    return out;
  }
`;

export const SCORING_BRIDGE = `
<script>
/* ${BRIDGE_MARKER} (auto-injected by /api/test-html) */
(function () {
${HARVEST_ANSWERS_JS}
  window.reportIELTSResult = window.reportIELTSResult || function (raw, total, band, answers) {
    try {
      parent.postMessage({
        source: "IELTS_CDI_TEST",
        type: "RESULT",
        payload: {
          // Client-reported score. The server NEVER persists these: it grades
          // 'answers' against the stored key, and refuses a test that has no
          // key rather than trusting a page-reported number. Still sent
          // because copies of this bridge are embedded in already-uploaded
          // files, and because the guest flow echoes the numbers back.
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
    if (visible(el)) {
      var m = (el.textContent || "").match(/(\\d+)\\s*\\/\\s*(\\d+)/);
      if (m && +m[2]) return { raw: +m[1], total: +m[2] };
    }
    // cdi-listening-master results layout: a bare integer in #rawScore with an
    // "out of N correct" caption beside it (no "11/40" string anywhere).
    var rs = document.querySelector("#rawScore");
    if (visible(rs)) {
      var rm = (rs.textContent || "").match(/\\d+/);
      if (rm) {
        var total = 40;
        var cap = (rs.parentNode && rs.parentNode.textContent) || "";
        var tm = cap.match(/out of\\s*(\\d+)/i);
        if (tm && +tm[1]) total = +tm[1];
        else if (typeof window.TOTAL === "number" && window.TOTAL > 0) total = window.TOTAL;
        return { raw: +rm[0], total: total };
      }
    }
    return null;
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
    // Reset the polling flag whenever the interval stops without success, so a
    // later Submit click (e.g. the confirm-screen Submit) can re-arm it.
    function stop() { clearInterval(iv); polling = false; }
    var iv = setInterval(function () {
      if (done) { clearInterval(iv); return; }
      ticks++;
      var s = readScore();
      if (!s) { lastSig = null; stable = 0; if (ticks > 140) stop(); return; }
      var sig = s.raw + "/" + s.total;
      if (sig === lastSig) stable++; else { lastSig = sig; stable = 1; }
      if (stable >= 4) {
        done = true;
        clearInterval(iv);
        window.reportIELTSResult(s.raw, s.total, readBand());
      } else if (ticks > 140) {
        stop();
      }
    }, 150);
  }

  document.addEventListener("click", function (e) {
    var t = e.target.closest &&
      e.target.closest('#submitBtn, .btn-submit, #deliver-button, .footer__deliverButton, ' +
        '#doSubmit, #footerSubmit, .big-submit, .submit-btn, [onclick*="submit"], [onclick*="Submit"]');
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
