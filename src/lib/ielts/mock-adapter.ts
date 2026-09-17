// Adapts a CDI paper for a MOCK exam sitting (0054). Applied by /api/test-html
// after the answer-key strip, INSTEAD of the practice bridge.
//
// A CDI file is a self-contained practice player: its own start screen with
// Practice / Mock cards, its own timer that auto-submits, its own results
// screen, and its own saved state in localStorage. Inside a mock every one of
// those is wrong — the platform owns the clock, the start, the submission and
// the record — so this module turns them off, and the self-test the admin runs
// on upload proves it worked for that exact file.
//
// THE "DONE" BUG (reported 2026-09-15). Each CDI file saves its state under a
// hard-coded key (e.g. 'ielts_cdi_reading_mock_reading_1_v1'). The mock iframe
// is served from the same origin as practice, so a student who had finished
// that paper in practice opened the mock and the player restored its finished
// state: "Done", every input disabled, no Submit. The practice bridge could not
// help — it is injected after the paper's scripts, by which time loadState()
// had already run. The fix is the STORAGE SHIM below, injected as the very
// first script in <head>: every storage read and write the paper makes goes to
// a namespace private to this attempt and section, so practice state is never
// seen and never overwritten.
//
// THE THREE PLAYER FAMILIES in the library (surveyed 2026-09-15, 208 papers):
//   reading-classic   #startScreen + #startTestBtn, count-up timer, showResults()
//   reading-modes     beginTest(mode) / startWithMode(mode) / #startMockBtn,
//                     countdown with autoSubmit()/autoSubmitMock()
//   listening-player  #playOverlay + .mode-card[data-mode=mock] + #playBtn,
//                     startTimer()/startCountdown() that clicks #doSubmit at 0
// Paper functions are CLASSIC-SCRIPT function declarations, so they are
// properties of window and a bare-name call inside the paper resolves to
// whatever window holds at call time. Replacing window.autoSubmit therefore
// reaches the paper's own tick(). That is the lever used throughout.

import { HARVEST_ANSWERS_JS, RESTORE_ANSWERS_JS } from "./scoring-bridge";

export const MOCK_BRIDGE_MARKER = "IELTS Platform mock bridge";

export type MockServeContext = {
  /** Storage namespace, e.g. "mock:<attemptId>:reading:" or "selftest:<nonce>:". */
  namespace: string;
  section: "listening" | "reading";
  origin: string;
  selftest: boolean;
  /** Read-only review of a released attempt (2026-09-16); see adaptForReview. */
  review?: boolean;
};

const js = (v: string) => JSON.stringify(v).replace(/</g, "\\u003c");

/** Runs before any paper script. Keep it dependency-free and ES5-safe. */
function storageShim(ctx: MockServeContext): string {
  return `<script>
/* ${MOCK_BRIDGE_MARKER}: storage shim (must stay the first script) */
(function () {
  var NS = ${js(ctx.namespace)};
  function makeStore(real) {
    var mem = {};
    var useReal = true;
    try { real.setItem(NS + "__probe", "1"); real.removeItem(NS + "__probe"); } catch (e) { useReal = false; }
    function keys() {
      if (!useReal) return Object.keys(mem);
      var out = [];
      for (var i = 0; i < real.length; i++) {
        var k = real.key(i);
        if (k && k.indexOf(NS) === 0) out.push(k.slice(NS.length));
      }
      return out;
    }
    var api = {
      getItem: function (k) {
        k = String(k);
        if (!useReal) return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null;
        return real.getItem(NS + k);
      },
      setItem: function (k, v) {
        k = String(k); v = String(v);
        if (!useReal) { mem[k] = v; return; }
        try { real.setItem(NS + k, v); } catch (e) { mem[k] = v; }
      },
      removeItem: function (k) {
        k = String(k);
        delete mem[k];
        if (useReal) { try { real.removeItem(NS + k); } catch (e) {} }
      },
      clear: function () { var ks = keys(); for (var i = 0; i < ks.length; i++) api.removeItem(ks[i]); mem = {}; },
      key: function (i) { var ks = keys(); return i >= 0 && i < ks.length ? ks[i] : null; }
    };
    Object.defineProperty(api, "length", { get: function () { return keys().length; } });
    if (typeof Proxy !== "function") return api;
    return new Proxy(api, {
      get: function (t, p) { if (p in t) return t[p]; if (typeof p !== "string") return undefined; var v = t.getItem(p); return v === null ? undefined : v; },
      set: function (t, p, v) { if (p in t) return true; t.setItem(p, v); return true; },
      deleteProperty: function (t, p) { t.removeItem(p); return true; },
      has: function (t, p) { return p in t || t.getItem(p) !== null; },
      ownKeys: function () { return keys(); },
      getOwnPropertyDescriptor: function (t, p) {
        var v = typeof p === "string" ? t.getItem(p) : null;
        return v === null ? undefined : { value: v, writable: true, enumerable: true, configurable: true };
      }
    });
  }
  function install(name) {
    var real = null;
    try { real = window[name]; } catch (e) { real = null; }
    var store = real ? makeStore(real) : makeStore({ length: 0, key: function () { return null; }, getItem: function () { return null; }, setItem: function () { throw new Error("no storage"); }, removeItem: function () {} });
    try { Object.defineProperty(window, name, { configurable: true, get: function () { return store; } }); } catch (e) {}
  }
  install("localStorage");
  install("sessionStorage");

  // NO BROWSER DIALOGS AND NO FULLSCREEN CALLS FROM THE PAPER (v2.1). Chrome
  // leaves fullscreen whenever a page opens alert/confirm/prompt, and every CDI
  // paper asks "Are you sure you want to submit?" with window.confirm — so a
  // student submitting from the paper was thrown out of fullscreen and told they
  // had left. confirm() now asks the PLATFORM instead (its in-page box) and
  // returns false, so the paper never grades itself.
  var ORIGIN = ${js(ctx.origin)};
  function tell(type, message) {
    try { parent.postMessage({ source: "IELTS_CDI_TEST", type: type, payload: { message: String(message == null ? "" : message) } }, ORIGIN); } catch (e) {}
  }
  try {
    // A review never submits anything, so its dialogs are simply swallowed.
    var REVIEW = ${ctx.review ? "true" : "false"};
    window.confirm = function (msg) {
      if (REVIEW) return false;
      tell(/submit|deliver|finish|hand in/i.test(String(msg)) ? "REQUEST_SUBMIT" : "NOTICE", msg);
      return false;
    };
    window.alert = function (msg) { tell("NOTICE", msg); };
    window.prompt = function () { return null; };
  } catch (e) {}
  var resolved = function () { return Promise.resolve(); };
  try { Element.prototype.requestFullscreen = resolved; } catch (e) {}
  try { Element.prototype.webkitRequestFullscreen = resolved; } catch (e) {}
  try { Document.prototype.exitFullscreen = resolved; document.exitFullscreen = resolved; } catch (e) {}
  try { Document.prototype.webkitExitFullscreen = resolved; document.webkitExitFullscreen = resolved; } catch (e) {}

  window.__IELTS_MOCK__ = { section: ${js(ctx.section)}, selftest: ${ctx.selftest ? "true" : "false"} };
})();
</script>`;
}

/** Hides everything the platform replaces: start screens, native timers, mode and results chrome. */
const MOCK_CSS = [
  "#startScreen,#loadingOverlay{display:none!important}",
  // Reading families keep timer, mode badge, pause/restart, mode switch and Retake together here.
  ".header__center{visibility:hidden!important}",
  "#testTimer,#timerControls,#timerPauseBtn,#timerRestartBtn,#timerResetBtn,#switchMockBtn,#switchPracticeBtn,#modeBadge,#headerRetakeBtn{display:none!important}",
  // Listening player: its own clock, fullscreen button and the Chilling bar.
  "#examTimer,#fsBtn,#chillBar,#fullscreenToggle{display:none!important}",
  // The platform owns fullscreen; a paper's own toggle would drop the student out of it.
  '[id*="ullscreen" i],[title="Full screen"],[aria-label*="full screen" i],[aria-label*="fullscreen" i]{display:none!important}',
  // Results / report screens never show in a mock.
  "#submissionModal,#printReportBtn{display:none!important}",
  // Any briefing video baked into the file: the platform plays its own.
  "video{display:none!important}",
  "#__mockAudioGate{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,.72)}",
  "#__mockAudioGate button{font:600 18px system-ui,sans-serif;padding:14px 26px;border-radius:12px;border:0;background:#2563eb;color:#fff;cursor:pointer}",
].join("");

function mockBridge(ctx: MockServeContext): string {
  return `<script>
/* ${MOCK_BRIDGE_MARKER} (auto-injected by /api/test-html for a mock sitting) */
(function () {
${HARVEST_ANSWERS_JS}
${RESTORE_ANSWERS_JS}
  var TARGET_ORIGIN = ${js(ctx.origin)};
  var SECTION = ${js(ctx.section)};
  var SELFTEST = ${ctx.selftest ? "true" : "false"};
  function post(type, payload) {
    try { parent.postMessage({ source: "IELTS_CDI_TEST", type: type, payload: payload || {} }, TARGET_ORIGIN); } catch (e) {}
  }
  function noop() {}
  // Synchronous read for the parent's last-moment save on pagehide / Leave.
  try { window.__IELTS_MOCK_HARVEST__ = harvestAnswers; } catch (e) {}
  function isFn(name) { try { return typeof window[name] === "function"; } catch (e) { return false; } }
  function byId(id) { return document.getElementById(id); }

  try {
    var style = document.createElement("style");
    style.textContent = ${js(MOCK_CSS)};
    (document.head || document.documentElement).appendChild(style);
  } catch (e) {}

  // ---- 1. The paper's own clock may never hand in. ------------------------
  var neutralized = [];
  ["autoSubmit", "autoSubmitMock"].forEach(function (n) {
    if (isFn(n)) { try { window[n] = noop; neutralized.push(n); } catch (e) {} }
  });
  var isListeningPlayer = !!(byId("playBtn") && byId("doSubmit"));
  if (isListeningPlayer) {
    // Its countdown clicks #doSubmit at 0:00. The platform's clock replaces it.
    ["startTimer", "startCountdown"].forEach(function (n) {
      if (isFn(n)) { try { window[n] = noop; neutralized.push(n); } catch (e) {} }
    });
  }

  // ---- 2. Results never render; a native submit is reported, once. --------
  var submitted = false;
  var activated = false;
  function reportSubmit(via) {
    if (submitted) return;
    submitted = true;
    post("SUBMIT", { answers: harvestAnswers(), via: via });
  }
  try { window.markOnPage = noop; } catch (e) {}
  if (isFn("showResults")) {
    try {
      window.showResults = function (hideModal) { if (!hideModal) reportSubmit("showResults"); };
      neutralized.push("showResults");
    } catch (e) {}
  }
  function wrapDoSubmit() {
    var btn = byId("doSubmit");
    if (!btn || btn.__mockWrapped) return;
    btn.__mockWrapped = true;
    btn.onclick = function (opts) {
      if (submitted) return;
      if (opts && opts.skipConfirm) { reportSubmit("doSubmit"); return; }
      // The platform's in-page box confirms (a browser dialog would drop fullscreen).
      var blank = 0;
      try {
        var got = harvestAnswers();
        var qs = document.querySelectorAll("[data-q], [name^='q']");
        var seen = {};
        for (var i = 0; i < qs.length; i++) {
          var q = qs[i].getAttribute("data-q") || (qs[i].name || "").replace(/^q/, "");
          if (/^\\d+$/.test(q) && !seen[q]) { seen[q] = 1; if (!got[q]) blank++; }
        }
      } catch (e) {}
      post("REQUEST_SUBMIT", { message: blank ? "You still have " + blank + " unanswered question" + (blank > 1 ? "s" : "") + "." : "" });
    };
    neutralized.push("doSubmit");
  }
  wrapDoSubmit();
  window.addEventListener("load", wrapDoSubmit);

  // ---- 3. Start the paper in Mock mode, without its start screen. ---------
  var family = isListeningPlayer ? "listening-player" : "unknown";
  function pauseEmbeddedVideos() {
    var vids = document.querySelectorAll("video");
    for (var i = 0; i < vids.length; i++) {
      try { vids[i].pause(); vids[i].removeAttribute("src"); vids[i].load(); } catch (e) {}
    }
  }
  function startPaper() {
    pauseEmbeddedVideos();
    if (isListeningPlayer) {
      var card = document.querySelector('.mode-card[data-mode="mock"]');
      if (card) card.click();
      return;
    }
    try {
      if (isFn("startWithMode")) { family = "reading-modes"; window.startWithMode("mock"); return; }
      if (isFn("beginTest") && (byId("startMockBtn") || document.querySelector('.mode-card[data-mode="mock"]'))) {
        family = "reading-modes"; window.beginTest("mock"); return;
      }
      var classic = byId("startTestBtn");
      if (classic) { family = "reading-classic"; classic.disabled = false; classic.click(); return; }
      if (isFn("beginTest")) { family = "reading-modes"; window.beginTest("mock"); return; }
    } catch (e) {
      post("ADAPTER_ERROR", { message: String(e && e.message || e) });
    }
  }

  function startScreenGone() {
    var s = byId("startScreen");
    if (!s) return true;
    var cs = window.getComputedStyle(s);
    // Hidden by the paper (display none / .gone) or only by our CSS — either way, check the paper got going.
    return s.style.display === "none" || s.classList.contains("gone") || cs.display === "none";
  }
  function paperStarted() {
    if (isListeningPlayer) {
      try { return typeof TEST_MODE !== "undefined" && TEST_MODE === "mock"; } catch (e) { return false; }
    }
    var started = false;
    try { if (typeof testStarted !== "undefined") started = !!testStarted; } catch (e) {}
    try { if (!started && typeof timerInterval !== "undefined" && timerInterval) started = true; } catch (e) {}
    return started && startScreenGone();
  }

  var readySent = false;
  function sendReady() {
    if (readySent) return;
    readySent = true;
    var audio = document.querySelector("audio");
    post("READY", {
      family: family,
      started: paperStarted(),
      neutralized: neutralized,
      hasAudio: !!audio,
      submittedAlready: (function () { try { return typeof testSubmitted !== "undefined" && !!testSubmitted; } catch (e) { return false; } })()
    });
  }
  function boot() {
    startPaper();
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      if (paperStarted() || tries > 40) { clearInterval(iv); sendReady(); }
    }, 150);
  }
  if (document.readyState === "complete") setTimeout(boot, 0);
  else window.addEventListener("load", function () { setTimeout(boot, 0); });

  // ---- 4. Listening: the platform starts the recording. -------------------
  function audioGate(audio) {
    if (byId("__mockAudioGate")) return;
    var gate = document.createElement("div");
    gate.id = "__mockAudioGate";
    var b = document.createElement("button");
    b.type = "button";
    b.textContent = "Start the recording";
    b.onclick = function () {
      audio.play().then(function () { gate.remove(); post("AUDIO_STARTED", {}); }).catch(function () {});
    };
    gate.appendChild(b);
    document.body.appendChild(gate);
    post("AUDIO_BLOCKED", {});
  }
  function activateListening() {
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      var btn = byId("playBtn");
      var audio = document.querySelector("audio");
      if (!btn || !audio) { if (tries > 600) clearInterval(iv); return; }
      var ready = !btn.disabled;
      try { if (typeof audioReady !== "undefined") ready = !!audioReady; } catch (e) {}
      if (!ready && tries < 600) return; // up to 60 s for the recording to buffer
      clearInterval(iv);
      try { btn.disabled = false; btn.click(); } catch (e) {}
      setTimeout(function () {
        if (audio.paused && !audio.ended) audioGate(audio);
        else post("AUDIO_STARTED", {});
      }, 1500);
    }, 100);
  }

  // ---- 5. Self-test helpers (admin upload check only). --------------------
  function selfTestFill() {
    var expected = {};
    var named = document.querySelectorAll('[name^="q"]');
    var radioSeen = {};
    for (var i = 0; i < named.length; i++) {
      var el = named[i];
      var m = (el.name || "").match(/^q(\\d+)$/);
      if (!m) continue;
      if (el.type === "radio") {
        if (radioSeen[el.name]) continue;
        radioSeen[el.name] = true;
        el.checked = true;
        try { el.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {}
        expected[m[1]] = el.value;
      } else if (el.type !== "checkbox" && "value" in el) {
        el.value = "t" + m[1];
        try { el.dispatchEvent(new Event("input", { bubbles: true })); } catch (e) {}
        expected[m[1]] = "t" + m[1];
      }
    }
    var gaps = document.querySelectorAll("input[data-q]");
    for (var g = 0; g < gaps.length; g++) {
      var q = gaps[g].getAttribute("data-q");
      if (expected[q]) continue;
      gaps[g].value = "t" + q;
      try { gaps[g].dispatchEvent(new Event("input", { bubbles: true })); } catch (e) {}
      expected[q] = "t" + q;
    }
    // Choose-N groups: tick the first N boxes; slots take the sorted letters.
    var groups = document.querySelectorAll('.mcq.multi[data-qs], [data-mcq-group]');
    for (var k = 0; k < groups.length; k++) {
      var spec = groups[k].getAttribute("data-qs") || groups[k].getAttribute("data-mcq-group") || "";
      var qs = spec.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
      if (qs.length === 1) {
        var rm = qs[0].match(/^(\\d+)\\s*[-\\u2013\\u2014]\\s*(\\d+)$/);
        if (rm) { qs = []; for (var r = Number(rm[1]); r <= Number(rm[2]); r++) qs.push(String(r)); }
      }
      var boxes = groups[k].querySelectorAll('input[type="checkbox"]');
      var picked = [];
      for (var b2 = 0; b2 < boxes.length && picked.length < qs.length; b2++) { boxes[b2].checked = true; picked.push(boxes[b2].value); }
      picked.sort();
      for (var p = 0; p < qs.length; p++) if (picked[p]) expected[qs[p]] = picked[p];
    }
    // Drag-and-drop zones: move a free token in, the way the shells' own drop does.
    var zones = document.querySelectorAll("[data-q]");
    var used = [];
    for (var z = 0; z < zones.length; z++) {
      var zone = zones[z];
      var zq = zone.getAttribute("data-q");
      if (!zq || expected[zq] || zone.tagName === "INPUT") continue;
      var tokens = document.querySelectorAll("[data-heading], [data-letter], [data-ending]");
      var tok = null;
      for (var t = 0; t < tokens.length; t++) {
        if (used.indexOf(tokens[t]) >= 0 || tokens[t].closest("[data-q]")) continue;
        tok = tokens[t]; break;
      }
      if (!tok) continue;
      used.push(tok);
      var clone = tok.cloneNode(true);
      zone.appendChild(clone);
      var val = clone.getAttribute("data-heading") || clone.getAttribute("data-letter") || clone.getAttribute("data-ending") || "";
      if (val) expected[zq] = val;
    }
    return expected;
  }

  // ---- 6. The platform's control channel. ---------------------------------
  window.addEventListener("message", function (e) {
    if (e.origin !== TARGET_ORIGIN || e.source !== parent) return;
    var d = e.data || {};
    if (d.source !== "IELTS_PLATFORM") return;
    try {
      if (d.type === "SNAPSHOT") {
        post("SNAPSHOT", { answers: harvestAnswers(), reason: d.reason || null });
      } else if (d.type === "RESTORE") {
        var missing = restoreAnswers(d.answers || {});
        post("RESTORED", { missing: missing });
      } else if (d.type === "ACTIVATE") {
        // Idempotent: the parent may re-send this after reloading a paper that
        // failed to load, and starting the recording twice would be a disaster.
        if (isListeningPlayer && !activated) { activated = true; activateListening(); }
      } else if (d.type === "LOCK") {
        submitted = true;
      } else if (SELFTEST && d.type === "SELFTEST_FILL") {
        var expected = selfTestFill();
        post("SELFTEST_FILLED", { expected: expected, harvested: harvestAnswers() });
      } else if (SELFTEST && d.type === "SELFTEST_STATE") {
        var audio = document.querySelector("audio");
        post("SELFTEST_STATE", {
          started: paperStarted(),
          submitted: submitted,
          audio: audio ? { src: audio.currentSrc || audio.src || "", readyState: audio.readyState, duration: isFinite(audio.duration) ? audio.duration : null, error: audio.error ? audio.error.code : null } : null
        });
      }
    } catch (err) {
      post("ADAPTER_ERROR", { message: String(err && err.message || err) });
    }
  });

  // Same deterrents as the practice bridge (text selection stays: highlighting needs it).
  ["contextmenu", "copy", "cut"].forEach(function (ev) {
    document.addEventListener(ev, function (e) { e.preventDefault(); }, true);
  });
  document.addEventListener("keydown", function (e) {
    var k = (e.key || "").toLowerCase();
    if ((e.ctrlKey || e.metaKey) && ["s", "p", "u"].indexOf(k) > -1) e.preventDefault();
    if (k === "f12") e.preventDefault();
  }, true);
})();
</script>`;
}

/** Inserts `snippet` straight after the opening <head> (or <html>, or at the very top). */
function injectFirst(html: string, snippet: string): string {
  const head = /<head(\s[^>]*)?>/i.exec(html);
  if (head) return html.slice(0, head.index + head[0].length) + snippet + html.slice(head.index + head[0].length);
  const root = /<html(\s[^>]*)?>/i.exec(html);
  if (root) return html.slice(0, root.index + root[0].length) + snippet + html.slice(root.index + root[0].length);
  return snippet + html;
}

/** Removes any bridge an older pipeline baked into the stored file. */
function stripOldBridges(html: string): string {
  return html.replace(/<script>[\s\S]*?IELTS Platform (?:scoring|sanitized|mock) bridge[\s\S]*?<\/script>/gi, "");
}

/**
 * The mock transform. `strippedHtml` must already have been through
 * sanitizeTestHtml's key strip (see prepareMockHtml in the route) — this adds
 * no key handling of its own, and a mock paper's key is never fetched back.
 */
export function adaptForMock(strippedHtml: string, ctx: MockServeContext): string {
  let out = stripOldBridges(strippedHtml);
  out = injectFirst(out, storageShim(ctx));
  const bridge = mockBridge(ctx);
  const idx = out.toLowerCase().lastIndexOf("</body>");
  return idx === -1 ? out + bridge : out.slice(0, idx) + bridge + out.slice(idx);
}

// ----------------------------------------------------------------- review mode
//
// After the owner RELEASES a result the student may reopen the paper they sat
// (owner, 2026-09-16): their own answers in place, marked, with the accepted
// answers — and nothing changeable.
//
// WHY THE PAPER DOES NOT MARK ITSELF. The obvious route was to restore the
// answers and let the shell grade, so the student got its own Result Report.
// It lies: a reading shell grades from its INTERNAL state object, which a
// restored DOM value never reaches, so matching, multiple-choice and drag
// answers all counted as blank — 11/40 for an attempt the platform had marked
// 38/40. The marking here is therefore the SERVER's: the per-question lines
// from the key snapshotted on the attempt (0051). The paper's own report and
// its Show Results button are hidden, and the answer key never reaches the
// browser at all (/api/test-key still refuses every mock paper).
//
// The recording stays playable, as the owner asked: review mode adds its own
// <audio controls> bar for Listening, since the player's transport is part of
// the exam chrome that gets switched off.

export type ReviewLineLite = { q: string; given: string; accepted: string[]; correct: boolean };

const REVIEW_CSS = [
  "#startScreen,#loadingOverlay,#playOverlay{display:none!important}",
  "#testTimer,#timerControls,#timerPauseBtn,#timerRestartBtn,#timerResetBtn,#switchMockBtn,#switchPracticeBtn,#modeBadge,#headerRetakeBtn{display:none!important}",
  "#examTimer,#fsBtn,#chillBar,#fullscreenToggle{display:none!important}",
  '[id*="ullscreen" i],[title="Full screen"],[aria-label*="full screen" i],[aria-label*="fullscreen" i]{display:none!important}',
  // The paper's own report would show a score it cannot compute here.
  "#submissionModal,#printReportBtn,#resultsPanel,#reportModal{display:none!important}",
  // Nothing may be handed in again.
  "#footerSubmit,#doSubmit,.big-submit,#submitBtn,#finalSubmitBtn{display:none!important}",
  // Any briefing video baked into the file.
  "video{display:none!important}",
  "#__reviewBar{position:sticky;top:0;z-index:2147483000;background:#19445f;color:#fff;font:600 14px Arial,sans-serif;padding:8px 14px;display:flex;gap:14px;align-items:center;flex-wrap:wrap}",
  "#__reviewBar audio{height:32px;max-width:420px;flex:1}",
  ".__rv{font:700 12px Arial,sans-serif;padding:1px 6px;border-radius:4px;margin-left:6px;white-space:nowrap;vertical-align:middle;display:inline-block}",
  ".__rv-ok{background:#e6f4ea;color:#137333;border:1px solid #137333}",
  ".__rv-no{background:#fce8e6;color:#a50e0e;border:1px solid #a50e0e}",
  ".__rv-fill{background:#fffbe6;border:1px solid #a50e0e;color:#a50e0e}",
].join("");

/** Injected after the paper's own scripts. ES5-safe, no dependencies. */
function reviewScript(ctx: MockServeContext, lines: ReviewLineLite[], summary: string): string {
  return `<script>
/* ${MOCK_BRIDGE_MARKER}: released-attempt review (marking comes from the server) */
(function () {
${RESTORE_ANSWERS_JS}
  /* the objects themselves, not js() — that would embed JSON *strings* */
  var LINES = ${JSON.stringify(lines).replace(/</g, "\\u003c")};
  var SUMMARY = ${js(summary)};
  var IS_LISTENING = ${js(ctx.section)} === "listening";
  function byId(id) { return document.getElementById(id); }
  function isFn(n) { try { return typeof window[n] === "function"; } catch (e) { return false; } }
  function noop() {}

  try {
    var style = document.createElement("style");
    style.textContent = ${js(REVIEW_CSS)};
    (document.head || document.documentElement).appendChild(style);
  } catch (e) {}

  // No clock, no hand-in, no results screen of the paper's own.
  ["autoSubmit", "autoSubmitMock", "startTimer", "startCountdown", "showResults", "markOnPage", "saveState"].forEach(function (n) {
    if (isFn(n)) { try { window[n] = noop; } catch (e) {} }
  });

  function startPaper() {
    try {
      if (IS_LISTENING) {
        var card = document.querySelector('.mode-card[data-mode="practice"]') || document.querySelector('.mode-card[data-mode="mock"]');
        if (card) { card.click(); return; }
      }
      if (isFn("startWithMode")) { window.startWithMode("practice"); return; }
      var classic = byId("startTestBtn");
      if (classic) { classic.disabled = false; classic.click(); return; }
      if (isFn("beginTest")) { window.beginTest("practice"); return; }
    } catch (e) {}
  }

  // Where question N lives, whatever the shell calls it.
  function anchorFor(q) {
    var sels = [
      'input[data-q="' + q + '"]',
      '[data-q="' + q + '"]',
      '#drop-q' + q,
      'input[name="q' + q + '"]',
      '[data-question="' + q + '"]'
    ];
    for (var i = 0; i < sels.length; i++) {
      var el = document.querySelector(sels[i]);
      if (el) return el;
    }
    return null;
  }

  function badge(text, cls) {
    var b = document.createElement("span");
    b.className = "__rv " + cls;
    b.textContent = text;
    return b;
  }

  function markOne(line) {
    var el = anchorFor(line.q);
    if (!el) return false;
    // Make sure their answer is visible: text inputs are filled by
    // restoreAnswers, but a drop zone or a letter box may still be empty.
    try {
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
        if (!el.value && line.given) el.value = line.given;
      } else if (!(el.textContent || "").trim() && line.given) {
        el.appendChild(document.createTextNode(line.given));
        el.className += " __rv-fill";
      }
    } catch (e) {}
    var host = el;
    // Radios/checkboxes: hang the badge off their label, not the box itself.
    try { if (el.type === "radio" || el.type === "checkbox") host = el.closest("label") || el.parentNode || el; } catch (e) {}
    var b = line.correct
      ? badge("\\u2713", "__rv-ok")
      : badge("\\u2717 " + (line.accepted.length ? line.accepted.slice(0, 3).join(" / ") : "\\u2014"), "__rv-no");
    b.title = line.correct
      ? "Correct. You wrote: " + (line.given || "(blank)")
      : "You wrote: " + (line.given || "(blank)") + ". Accepted: " + line.accepted.join(" / ");
    try {
      if (host.parentNode) host.parentNode.insertBefore(b, host.nextSibling);
      else host.appendChild(b);
      return true;
    } catch (e) { return false; }
  }

  function bar() {
    if (byId("__reviewBar")) return;
    var b = document.createElement("div");
    b.id = "__reviewBar";
    var t = document.createElement("span");
    t.textContent = SUMMARY;
    b.appendChild(t);
    var note = document.createElement("span");
    note.style.fontWeight = "400";
    note.textContent = "Your answers, marked. \\u2713 correct, \\u2717 shows the accepted answer. Nothing can be changed.";
    b.appendChild(note);
    if (IS_LISTENING) {
      var src = "";
      var a = document.querySelector("audio");
      try { src = a ? (a.currentSrc || a.src || "") : ""; } catch (e) {}
      if (src) {
        // The player's own transport is part of the exam chrome, so review gets
        // its own: the owner asked for free replay while checking answers.
        var own = document.createElement("audio");
        own.controls = true;
        own.preload = "metadata";
        own.src = src;
        b.appendChild(own);
        try { a.pause(); } catch (e) {}
      }
    }
    if (document.body) document.body.insertBefore(b, document.body.firstChild);
  }

  function lock() {
    try {
      var fields = document.querySelectorAll("input, textarea, select");
      for (var i = 0; i < fields.length; i++) {
        if (fields[i].closest && fields[i].closest("#__reviewBar")) continue;
        fields[i].readOnly = true;
        fields[i].disabled = true;
      }
      var drags = document.querySelectorAll("[draggable='true']");
      for (var d = 0; d < drags.length; d++) drags[d].setAttribute("draggable", "false");
      // Buttons that would hand in, grade or restart. Matched by their words,
      // because every shell names them differently.
      var btns = document.querySelectorAll("button, .btn, [role='button']");
      for (var k = 0; k < btns.length; k++) {
        var txt = (btns[k].textContent || "").toLowerCase();
        if (btns[k].closest && btns[k].closest("#__reviewBar")) continue;
        if (/submit|show results|retake|restart|deliver|finish/.test(txt)) btns[k].style.display = "none";
      }
    } catch (e) {}
  }

  function boot() {
    startPaper();
    setTimeout(function () {
      bar();
      try { restoreAnswers(LINES.reduce(function (acc, l) { if (l.given) acc[l.q] = l.given; return acc; }, {})); } catch (e) {}
      setTimeout(function () {
        var marked = 0;
        for (var i = 0; i < LINES.length; i++) if (markOne(LINES[i])) marked++;
        lock();
        try { window.__IELTS_REVIEW__ = { marked: marked, total: LINES.length }; } catch (e) {}
      }, 500);
    }, 700);
  }
  if (document.readyState === "complete") setTimeout(boot, 0);
  else window.addEventListener("load", function () { setTimeout(boot, 0); });
})();
</script>`;
}

/**
 * The review transform. `strippedHtml` must be the key-STRIPPED file
 * (stripTestHtml), the same input the exam adapter takes: the marking is
 * injected per question, so the paper needs no key of its own.
 */
export function adaptForReview(
  strippedHtml: string,
  ctx: MockServeContext,
  lines: ReviewLineLite[],
  summary: string,
): string {
  let out = stripOldBridges(strippedHtml);
  out = injectFirst(out, storageShim(ctx));
  const script = reviewScript(ctx, lines, summary);
  const idx = out.toLowerCase().lastIndexOf("</body>");
  return idx === -1 ? out + script : out.slice(0, idx) + script + out.slice(idx);
}
