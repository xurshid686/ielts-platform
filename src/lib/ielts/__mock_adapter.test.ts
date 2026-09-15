import { describe, it, expect } from "vitest";
import { adaptForMock, MOCK_BRIDGE_MARKER } from "./mock-adapter";
import { stripTestHtml, SanitizeIncompleteError } from "./sanitize-test-html";

// The mock adapter's contract (0054). Runtime behaviour (start, timer, restore)
// is proven in a real browser by the admin self-test and the E2E run; these pin
// the structural guarantees that make it work at all.

const ORIGIN = "https://mockonline.test";
const ID = "11111111-2222-3333-4444-555555555555";
const ctx = { namespace: "mock:aaaa:reading:", section: "reading" as const, origin: ORIGIN, selftest: false };

const paper = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>P</title>
<script>const STORAGE_KEY='ielts_cdi_reading_x_v1'; loadState();</script></head>
<body><div id="startScreen"></div>
<script>const correctAnswers = { 1:'TRUE' }; function autoSubmit(){ doSubmit(); }</script>
</body></html>`;

describe("adaptForMock", () => {
  it("puts the storage shim before every paper script", () => {
    const out = adaptForMock(stripTestHtml(paper, ORIGIN, ID), ctx);
    const shim = out.indexOf("storage shim");
    const firstPaperScript = out.indexOf("STORAGE_KEY");
    expect(shim).toBeGreaterThan(-1);
    expect(shim).toBeLessThan(firstPaperScript);
    expect(out.indexOf("<head>")).toBeLessThan(shim);
  });

  it("namespaces storage per sitting and sets the mock flag", () => {
    const out = adaptForMock(paper, ctx);
    expect(out).toContain('var NS = "mock:aaaa:reading:"');
    expect(out).toContain("__IELTS_MOCK__");
    expect(out).toContain('install("localStorage")');
    expect(out).toContain('install("sessionStorage")');
  });

  it("injects the bridge after the paper's scripts, before </body>", () => {
    const out = adaptForMock(paper, ctx);
    const bridge = out.lastIndexOf(`${MOCK_BRIDGE_MARKER} (auto-injected`);
    expect(bridge).toBeGreaterThan(out.indexOf("function autoSubmit"));
    expect(bridge).toBeLessThan(out.toLowerCase().lastIndexOf("</body>"));
  });

  it("never lets a namespace break out of its script", () => {
    const out = adaptForMock(paper, { ...ctx, namespace: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("</script><script>alert(1)");
  });

  it("replaces any older bridge baked into the file", () => {
    const withOld = paper.replace("</body>", "<script>/* IELTS Platform scoring bridge */ window.x=1;</script></body>");
    const out = adaptForMock(withOld, ctx);
    expect(out).not.toContain("IELTS Platform scoring bridge");
    expect(out.split(`${MOCK_BRIDGE_MARKER} (auto-injected`).length).toBe(2);
  });

  it("works on a file with no <head>", () => {
    const out = adaptForMock("<html><body><script>var a=1</script></body></html>", ctx);
    expect(out.indexOf("storage shim")).toBeLessThan(out.indexOf("var a=1"));
  });

  it("only exposes self-test hooks when asked", () => {
    expect(adaptForMock(paper, ctx)).toContain("var SELFTEST = false");
    expect(adaptForMock(paper, { ...ctx, selftest: true })).toContain("var SELFTEST = true");
  });
});

describe("stripTestHtml (the mock path's key strip)", () => {
  it("blanks the key and still fails closed", () => {
    expect(stripTestHtml(paper, ORIGIN, ID)).toContain("correctAnswers = {}");
    const broken = paper.replace("{ 1:'TRUE' }", "{ 1:'TRUE' // don't\n }");
    expect(() => stripTestHtml(broken, ORIGIN, ID)).toThrow(SanitizeIncompleteError);
  });
});
