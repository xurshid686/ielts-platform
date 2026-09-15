// Upload-time PARSING of a mock paper (0054): what the file is, what it
// contains, and whether the mock adapter (lib/ielts/mock-adapter.ts) knows how
// to drive it. Static — the uploaded code is never run on the server. The live
// proof comes afterwards from the self-test the admin's browser runs, and a
// paper is usable in a session only once both agree.
//
// Pure functions so the fixtures test (src/lib/ielts/__mock_profile.test.ts)
// can run them over real library files.

import { createHash } from "node:crypto";

export const PROFILE_VERSION = 1;

export type PlayerFamily = "reading-classic" | "reading-modes" | "listening-player";

export type MockPaperProfile = {
  v: number;
  hash: string;
  skill: "reading" | "listening";
  family: PlayerFamily | null;
  /** Question numbers the file has an answer control for (static scan). */
  controls: number[];
  /** Question numbers in the answer key. */
  keyQuestions: number[];
  /** Key questions with no control found statically (the self-test has the final word). */
  uncontrolled: number[];
  parts: { part: number; from: number; to: number }[];
  audioSrc: string | null;
  /** Filled in by the upload action (HEAD request); null = not checked. */
  audioReachable: boolean | null;
  hasOwnVideo: boolean;
  storageKeys: string[];
  hooks: string[];
  errors: string[];
  warnings: string[];
  ok: boolean;
  suggestedMinutes: number;
  profiledAt: string;
};

export type SelfTestResult = {
  hash: string;
  passed: boolean;
  ranAt: string;
  checks: { id: string; label: string; ok: boolean; detail?: string }[];
};

const uniqSorted = (xs: number[]) => [...new Set(xs)].filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);

function range(from: number, to: number): number[] {
  const out: number[] = [];
  if (to < from || to - from > 60) return out;
  for (let i = from; i <= to; i++) out.push(i);
  return out;
}

export function hashHtml(html: string): string {
  return createHash("sha256").update(html).digest("hex");
}

/** Question numbers the paper has a control for, by every addressing scheme harvestAnswers() reads. */
export function findControls(html: string): number[] {
  const qs: number[] = [];
  for (const m of html.matchAll(/\bname\s*=\s*["']q(\d+)["']/g)) qs.push(Number(m[1]));
  for (const m of html.matchAll(/\bdata-q\s*=\s*["'](\d+)["']/g)) qs.push(Number(m[1]));
  for (const m of html.matchAll(/\bid\s*=\s*["']drop-q(\d+)["']/g)) qs.push(Number(m[1]));
  for (const m of html.matchAll(/\bdata-qs\s*=\s*["']([\d,\s]+)["']/g)) {
    for (const part of m[1].split(",")) if (part.trim()) qs.push(Number(part.trim()));
  }
  for (const m of html.matchAll(/\bdata-mcq-group\s*=\s*["'](\d+)\s*[-–—]\s*(\d+)["']/g)) {
    qs.push(...range(Number(m[1]), Number(m[2])));
  }
  return uniqSorted(qs);
}

export function detectFamily(html: string): { family: PlayerFamily | null; hooks: string[] } {
  const has = (re: RegExp) => re.test(html);
  const hooks: string[] = [];
  const mark = (name: string, re: RegExp) => {
    const ok = has(re);
    if (ok) hooks.push(name);
    return ok;
  };
  const playBtn = mark("#playBtn", /\bid\s*=\s*["']playBtn["']/);
  const doSubmit = mark("#doSubmit", /\bid\s*=\s*["']doSubmit["']/);
  const audio = mark("<audio>", /<audio\b/i);
  const mockCard = mark('mode-card[data-mode="mock"]', /data-mode\s*=\s*["']mock["']/);
  const beginTest = mark("beginTest()", /function\s+beginTest\s*\(/);
  const startWithMode = mark("startWithMode()", /function\s+startWithMode\s*\(/);
  const startMockBtn = mark("#startMockBtn", /\bid\s*=\s*["']startMockBtn["']/);
  const startTestBtn = mark("#startTestBtn", /\bid\s*=\s*["']startTestBtn["']/);
  mark("#startScreen", /\bid\s*=\s*["']startScreen["']/);
  mark("showResults()", /function\s+showResults\s*\(/);
  mark("autoSubmit()", /function\s+autoSubmit\s*\(/);
  mark("autoSubmitMock()", /function\s+autoSubmitMock\s*\(/);
  mark("startTimer()", /function\s+startTimer\s*\(/);
  mark("startCountdown()", /function\s+startCountdown\s*\(/);

  if (playBtn && doSubmit && audio && mockCard) return { family: "listening-player", hooks };
  if (startWithMode || (beginTest && (startMockBtn || mockCard))) return { family: "reading-modes", hooks };
  if (startTestBtn) return { family: "reading-classic", hooks };
  if (beginTest) return { family: "reading-modes", hooks };
  return { family: null, hooks };
}

function findParts(html: string): MockPaperProfile["parts"] {
  const lit = /PART_RANGES\s*=\s*\{([^}]*)\}/.exec(html);
  if (!lit) return [];
  const parts: MockPaperProfile["parts"] = [];
  for (const m of lit[1].matchAll(/(\d+)\s*:\s*\[\s*(\d+)\s*,\s*(\d+)\s*\]/g)) {
    parts.push({ part: Number(m[1]), from: Number(m[2]), to: Number(m[3]) });
  }
  return parts.sort((a, b) => a.part - b.part);
}

function findStorageKeys(html: string): string[] {
  const keys = new Set<string>();
  for (const m of html.matchAll(/STORAGE_KEY\s*=\s*['"]([^'"]{1,120})['"]/g)) keys.add(m[1]);
  for (const m of html.matchAll(/localStorage\.(?:get|set|remove)Item\(\s*['"]([^'"]{1,120})['"]/g)) keys.add(m[1]);
  return [...keys];
}

function findAudioSrc(html: string): string | null {
  const m = /<audio\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i.exec(html);
  return m ? m[1] : null;
}

export function suggestedMinutes(skill: "reading" | "listening", questions: number): number {
  if (skill === "listening") return 40;
  if (questions <= 14) return 20;
  if (questions <= 27) return 40;
  return 60;
}

/**
 * Profiles a paper. `key` is the answer key createTestFromHtml() extracted
 * (question number → accepted answers); pass null when there is none.
 */
export function profileMockPaper(
  html: string,
  skill: "reading" | "listening",
  key: Record<string, unknown> | null,
): MockPaperProfile {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { family, hooks } = detectFamily(html);
  const controls = findControls(html);
  const keyQuestions = uniqSorted(Object.keys(key ?? {}).map(Number));
  const uncontrolled = keyQuestions.filter((q) => !controls.includes(q));
  const audioSrc = findAudioSrc(html);
  const hasOwnVideo = /<video\b|__TEST_VIDEO_SRC__/i.test(html);

  if (!family) {
    errors.push("Unsupported player: none of the known start/timer hooks were found (no #startTestBtn, beginTest(), or listening #playBtn). This file can't be driven in a mock.");
  } else if (family === "listening-player" && skill !== "listening") {
    errors.push("This is a Listening player, but it was uploaded as Reading.");
  } else if (family !== "listening-player" && skill === "listening") {
    errors.push("This is a Reading player, but it was uploaded as Listening.");
  }
  if (!keyQuestions.length) errors.push("No answer key was found, so the paper can't be marked.");
  if (uncontrolled.length) {
    warnings.push(`No answer box found in the file for question${uncontrolled.length === 1 ? "" : "s"} ${uncontrolled.join(", ")} — the self-test will confirm.`);
  }
  const extra = controls.filter((q) => keyQuestions.length && !keyQuestions.includes(q));
  if (extra.length) warnings.push(`Answer boxes without a key entry: ${extra.join(", ")}.`);
  if (skill === "listening") {
    if (!audioSrc) errors.push("No recording: the file has no <audio src>.");
    else if (/^data:/i.test(audioSrc)) warnings.push("The recording is embedded in the file (data URI), which makes it slow to load. Hosting it on R2 is better.");
    else if (!/^https:\/\//i.test(audioSrc)) errors.push(`The recording must be an https URL (found "${audioSrc.slice(0, 60)}").`);
  }
  if (hasOwnVideo) warnings.push("The file has its own briefing video; it is hidden in the mock (the platform plays the instruction video).");
  if (keyQuestions.length && keyQuestions.length !== 40 && keyQuestions.length !== 13 && keyQuestions.length !== 14) {
    warnings.push(`${keyQuestions.length} questions — not a standard full test. Bands are still computed from the ${skill} table.`);
  }

  return {
    v: PROFILE_VERSION,
    hash: hashHtml(html),
    skill,
    family,
    controls,
    keyQuestions,
    uncontrolled,
    parts: findParts(html),
    audioSrc,
    audioReachable: null,
    hasOwnVideo,
    storageKeys: findStorageKeys(html),
    hooks,
    errors,
    warnings,
    ok: errors.length === 0,
    suggestedMinutes: suggestedMinutes(skill, keyQuestions.length),
    profiledAt: new Date().toISOString(),
  };
}
