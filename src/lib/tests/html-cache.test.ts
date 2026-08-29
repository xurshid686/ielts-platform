import { describe, it, expect, beforeEach } from "vitest";
import {
  getCachedTestHtml,
  setCachedTestHtml,
  clearTestHtmlCache,
} from "./html-cache";

// A string of roughly n bytes (ASCII, so 1 char == 1 byte).
const blob = (n: number) => "x".repeat(n);

describe("test html cache", () => {
  beforeEach(() => clearTestHtmlCache());

  it("returns null for a path it has never seen", () => {
    expect(getCachedTestHtml("reading/nope.html")).toBeNull();
  });

  it("round-trips a stored file", () => {
    setCachedTestHtml("reading/a.html", "<html>a</html>");
    expect(getCachedTestHtml("reading/a.html")).toBe("<html>a</html>");
  });

  it("keys strictly by path, so a re-upload's new UUID path cannot hit a stale entry", () => {
    setCachedTestHtml("reading/old-uuid.html", "old");
    expect(getCachedTestHtml("reading/new-uuid.html")).toBeNull();
  });

  it("refuses to cache a file over the per-entry cap", () => {
    setCachedTestHtml("reading/huge.html", blob(7 * 1024 * 1024));
    expect(getCachedTestHtml("reading/huge.html")).toBeNull();
  });

  it("evicts least-recently-used entries once the total cap is passed", () => {
    // 6 x 5 MiB = 30 MiB fits; the seventh pushes past the 32 MiB ceiling.
    for (let i = 0; i < 6; i++) setCachedTestHtml(`reading/${i}.html`, blob(5 * 1024 * 1024));

    // Touch 0 so it is the most recent, making 1 the eviction candidate.
    expect(getCachedTestHtml("reading/0.html")).not.toBeNull();

    setCachedTestHtml("reading/6.html", blob(5 * 1024 * 1024));

    expect(getCachedTestHtml("reading/1.html")).toBeNull();
    expect(getCachedTestHtml("reading/0.html")).not.toBeNull();
    expect(getCachedTestHtml("reading/6.html")).not.toBeNull();
  });

  it("overwriting a path does not double-count its bytes", () => {
    setCachedTestHtml("reading/a.html", blob(5 * 1024 * 1024));
    for (let i = 0; i < 10; i++) setCachedTestHtml("reading/a.html", blob(5 * 1024 * 1024));
    // Still the only entry, so nothing was evicted to make room for itself.
    expect(getCachedTestHtml("reading/a.html")).not.toBeNull();
  });
});
