"use client";

// The live check of a mock paper (0054), run in the ADMIN'S browser right after
// upload — no server-side browser exists on the DigitalOcean host. It loads the
// paper exactly the way a student's mock does (/api/test-html?selftest=<nonce>
// goes through the same mock adapter, with a throwaway storage namespace) in an
// off-screen iframe, and proves the things that break a sitting:
//
//   ready     the adapter got the paper going without its start screen
//   timer     the paper's own clock can't hand in by itself
//   fill      every question takes an answer the platform can read back
//   coverage  every question in the answer key has such a control
//   restore   after a reload, typed/ticked answers come back (drag answers are
//             reported, not failed: students re-place those, as before)
//   audio     Listening only: the recording loads
//
// The result goes to recordMockSelfTestAction, which stamps it with the file's
// hash so it can never vouch for a different upload.

import type { MockPaperProfile } from "@/lib/ielts/mock-profile";

export type SelfTestCheck = { id: string; label: string; ok: boolean; detail?: string };

type Msg = { type: string; payload: Record<string, unknown> };

const nonce = () => Math.random().toString(36).slice(2, 12) + Date.now().toString(36);

function mountFrame(testId: string): { frame: HTMLIFrameElement; remove: () => void } {
  const frame = document.createElement("iframe");
  frame.src = `/api/test-html/${testId}?selftest=${nonce()}`;
  frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-modals");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  Object.assign(frame.style, { position: "fixed", left: "-14000px", top: "0", width: "1280px", height: "820px", border: "0" });
  document.body.appendChild(frame);
  return { frame, remove: () => frame.remove() };
}

/** Collects messages from one iframe; `next(type)` resolves with the first matching one. */
function channel(frame: HTMLIFrameElement) {
  const seen: Msg[] = [];
  const waiters: { type: string; resolve: (m: Msg | null) => void }[] = [];
  function onMessage(e: MessageEvent) {
    if (e.origin !== window.location.origin || e.source !== frame.contentWindow) return;
    const d = e.data as { source?: string; type?: string; payload?: Record<string, unknown> } | null;
    if (!d || d.source !== "IELTS_CDI_TEST" || !d.type) return;
    const m = { type: d.type, payload: d.payload ?? {} };
    seen.push(m);
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (waiters[i].type === m.type) {
        waiters[i].resolve(m);
        waiters.splice(i, 1);
      }
    }
  }
  window.addEventListener("message", onMessage);
  return {
    seen,
    next(type: string, timeoutMs: number): Promise<Msg | null> {
      const already = seen.find((m) => m.type === type);
      if (already) {
        seen.splice(seen.indexOf(already), 1);
        return Promise.resolve(already);
      }
      return new Promise((resolve) => {
        const w = { type, resolve };
        waiters.push(w);
        setTimeout(() => {
          const i = waiters.indexOf(w);
          if (i >= 0) {
            waiters.splice(i, 1);
            resolve(null);
          }
        }, timeoutMs);
      });
    },
    send(type: string, extra: Record<string, unknown> = {}) {
      frame.contentWindow?.postMessage({ source: "IELTS_PLATFORM", type, ...extra }, window.location.origin);
    },
    close: () => window.removeEventListener("message", onMessage),
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const list = (qs: string[]) => qs.map(Number).sort((a, b) => a - b).join(", ");

export async function runPaperSelfTest(
  testId: string,
  profile: MockPaperProfile,
  onStep?: (label: string) => void,
): Promise<SelfTestCheck[]> {
  const checks: SelfTestCheck[] = [];
  const add = (c: SelfTestCheck) => checks.push(c);

  add({
    id: "parse",
    label: "File parsed (player type, questions, answer key)",
    ok: profile.ok,
    detail: profile.ok ? `${profile.family} · ${profile.keyQuestions.length} questions` : profile.errors.join(" "),
  });
  if (!profile.ok) return checks;

  // ---- run 1: start, timer, fill + harvest, coverage, audio
  onStep?.("Opening the paper in mock mode…");
  const a = mountFrame(testId);
  const ca = channel(a.frame);
  let expected: Record<string, string> = {};
  try {
    const ready = await ca.next("READY", 25_000);
    add({
      id: "ready",
      label: "Opens in mock mode without its start screen",
      ok: !!ready?.payload.started,
      detail: ready ? `Detected ${String(ready.payload.family)}.` : "The paper never reported READY (25 s).",
    });
    if (!ready) return checks;

    onStep?.("Checking the paper's own timer…");
    await sleep(3500);
    const selfSubmitted = ca.seen.some((m) => m.type === "SUBMIT");
    const neutralized = Array.isArray(ready.payload.neutralized) ? (ready.payload.neutralized as string[]) : [];
    add({
      id: "timer",
      label: "The paper's own timer and results can't hand in",
      ok: !selfSubmitted,
      detail: selfSubmitted ? "The paper submitted itself." : neutralized.length ? `Switched off: ${neutralized.join(", ")}.` : "No self-submitting timer found.",
    });

    onStep?.("Answering every question…");
    ca.send("SELFTEST_FILL");
    const filled = await ca.next("SELFTEST_FILLED", 10_000);
    expected = (filled?.payload.expected as Record<string, string>) ?? {};
    const harvested = (filled?.payload.harvested as Record<string, string>) ?? {};
    const unread = Object.keys(expected).filter((q) => harvested[q] !== expected[q]);
    add({
      id: "fill",
      label: "Every answer can be read back by the platform",
      ok: !!filled && Object.keys(expected).length > 0 && unread.length === 0,
      detail: !filled
        ? "The paper did not answer the fill request."
        : unread.length
          ? `Not read back: Q${list(unread)}.`
          : `${Object.keys(expected).length} answers read back.`,
    });
    const uncovered = profile.keyQuestions.map(String).filter((q) => !(q in expected));
    add({
      id: "coverage",
      label: "Every question in the answer key has an answer box",
      ok: uncovered.length === 0,
      detail: uncovered.length ? `No usable answer box for Q${list(uncovered)}.` : `All ${profile.keyQuestions.length} covered.`,
    });

    if (profile.skill === "listening") {
      onStep?.("Loading the recording…");
      type AudioState = { readyState?: number; duration?: number | null; error?: number | null };
      let audio = null as AudioState | null;
      for (let i = 0; i < 20; i++) {
        ca.send("SELFTEST_STATE");
        const st = await ca.next("SELFTEST_STATE", 3000);
        audio = (st?.payload.audio as AudioState | undefined) ?? null;
        if (audio && ((audio.readyState ?? 0) >= 1 || audio.error)) break;
        await sleep(1000);
      }
      const ok = !!audio && (audio.readyState ?? 0) >= 1 && !audio.error;
      add({
        id: "audio",
        label: "The recording loads",
        ok,
        detail: ok ? `Duration ${Math.round((audio?.duration ?? 0) / 60)} min.` : audio?.error ? `Audio error ${audio.error}.` : "The recording did not load in 25 s.",
      });
    }
  } finally {
    ca.close();
    a.remove();
  }

  // ---- run 2: a "reload" — fresh page, restore the answers
  if (Object.keys(expected).length) {
    onStep?.("Checking answers survive a reload…");
    const b = mountFrame(testId);
    const cb = channel(b.frame);
    try {
      const ready = await cb.next("READY", 25_000);
      if (!ready) {
        add({ id: "restore", label: "Answers come back after a reload", ok: false, detail: "The reloaded paper never reported READY." });
      } else {
        cb.send("RESTORE", { answers: expected });
        const restored = await cb.next("RESTORED", 10_000);
        const missing = ((restored?.payload.missing as number[]) ?? []).map(String);
        cb.send("SNAPSHOT");
        const snap = await cb.next("SNAPSHOT", 10_000);
        const got = (snap?.payload.answers as Record<string, string>) ?? {};
        const wrong = Object.keys(expected).filter((q) => !missing.includes(q) && got[q] !== expected[q]);
        add({
          id: "restore",
          label: "Answers come back after a reload",
          ok: !!restored && !!snap && wrong.length === 0,
          detail: !restored || !snap
            ? "The reloaded paper did not answer."
            : [
                wrong.length ? `Lost after reload: Q${list(wrong)}.` : "Typed and ticked answers restored.",
                missing.length ? `Drag-and-drop Q${list(missing)} must be re-placed by the student after a reload (expected).` : "",
              ]
                .filter(Boolean)
                .join(" "),
        });
      }
    } finally {
      cb.close();
      b.remove();
    }
  }
  return checks;
}
