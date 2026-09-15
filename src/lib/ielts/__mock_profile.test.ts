import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { detectFamily, findControls, profileMockPaper, suggestedMinutes } from "./mock-profile";
import { extractAnswerKey } from "./extract-key";

// Upload-time parsing of mock papers (0054). The synthetic shells below carry
// exactly the hooks the three library families were found to use in the
// 2026-09-15 survey of all 208 papers.

const key = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [String(i + 1), ["a"]]));
const inputs = (n: number) => Array.from({ length: n }, (_, i) => `<input name="q${i + 1}">`).join("");

const classic = `<div id="startScreen"><button id="startTestBtn">Start</button></div>${inputs(13)}
<script>function startTimer(){} function showResults(){}</script>`;
const modes = `<div id="startScreen"><div class="mode-card mock" data-mode="mock"></div></div>${inputs(40)}
<script>const PART_RANGES = {1:[1,13],2:[14,26],3:[27,40]}; function beginTest(mode){} function autoSubmit(){}</script>`;
const listening = `<div id="playOverlay"><button class="mode-card" data-mode="mock"></button><button id="playBtn"></button></div>
${Array.from({ length: 40 }, (_, i) => `<input data-q="${i + 1}">`).join("")}<button id="doSubmit"></button>
<audio id="audio" src="https://pub-x.r2.dev/test.mp3"></audio><script>function startTimer(){}</script>`;

describe("detectFamily", () => {
  it("recognises the three library families", () => {
    expect(detectFamily(classic).family).toBe("reading-classic");
    expect(detectFamily(modes).family).toBe("reading-modes");
    expect(detectFamily(listening).family).toBe("listening-player");
  });
  it("prefers startWithMode() when a file has it", () => {
    expect(detectFamily(`<button id="mockTestBtn"></button><script>function startWithMode(m){} function beginTest(){}</script>`).family).toBe("reading-modes");
  });
  it("returns null for an unknown player", () => {
    expect(detectFamily("<html><body><input name='q1'></body></html>").family).toBeNull();
  });
});

describe("findControls", () => {
  it("reads every addressing scheme harvestAnswers() understands", () => {
    const html = `<input name="q1"><input data-q="2"><div id="drop-q3"></div><div class="mcq multi" data-qs="4,5"></div><div data-mcq-group="6-7"></div>`;
    expect(findControls(html)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});

describe("profileMockPaper", () => {
  it("passes a well-formed reading paper and suggests its time", () => {
    const p = profileMockPaper(modes, "reading", key(40));
    expect(p.ok).toBe(true);
    expect(p.parts).toEqual([
      { part: 1, from: 1, to: 13 },
      { part: 2, from: 14, to: 26 },
      { part: 3, from: 27, to: 40 },
    ]);
    expect(p.suggestedMinutes).toBe(60);
    expect(p.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects an unknown player and a skill mismatch", () => {
    expect(profileMockPaper("<input name='q1'>", "reading", key(1)).errors.join(" ")).toMatch(/Unsupported player/);
    expect(profileMockPaper(listening, "reading", key(40)).errors.join(" ")).toMatch(/uploaded as Reading/);
    expect(profileMockPaper(classic, "listening", key(13)).errors.join(" ")).toMatch(/uploaded as Listening/);
  });

  it("requires a key and, for Listening, an https recording", () => {
    expect(profileMockPaper(classic, "reading", null).ok).toBe(false);
    expect(profileMockPaper(listening.replace("https://pub-x.r2.dev/test.mp3", "test.mp3"), "listening", key(40)).ok).toBe(false);
    expect(profileMockPaper(listening.replace('src="https://pub-x.r2.dev/test.mp3"', 'src="data:audio/mpeg;base64,AAAA"'), "listening", key(40)).ok).toBe(true);
  });

  it("warns (does not fail) when a key question has no statically visible box", () => {
    const p = profileMockPaper(classic, "reading", key(14));
    expect(p.ok).toBe(true);
    expect(p.uncontrolled).toEqual([14]);
  });

  it("suggests section times by size", () => {
    expect(suggestedMinutes("reading", 13)).toBe(20);
    expect(suggestedMinutes("reading", 26)).toBe(40);
    expect(suggestedMinutes("listening", 40)).toBe(40);
  });
});

// Optional sweep over real papers: set MOCK_PAPERS_DIR to a folder of CDI html.
const dir = process.env.MOCK_PAPERS_DIR;
describe.skipIf(!dir || !existsSync(dir))("library sweep", () => {
  it("recognises every paper's player", () => {
    const unknown: string[] = [];
    for (const f of readdirSync(dir!).filter((n) => n.endsWith(".html"))) {
      const html = readFileSync(`${dir}/${f}`, "utf8");
      const skill = /<audio\b/i.test(html) ? "listening" : "reading";
      if (!profileMockPaper(html, skill, extractAnswerKey(html)?.key ?? null).family) unknown.push(f);
    }
    expect(unknown).toEqual([]);
  });
});
