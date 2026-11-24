import { describe, expect, it } from "vitest";
import { likeLiteral, safeNext } from "./utils";

describe("safeNext", () => {
  it("keeps same-origin paths", () => {
    expect(safeNext("/reading/abc?x=1#q")).toBe("/reading/abc?x=1#q");
    expect(safeNext("/premium?buy=ultima&months=3")).toBe("/premium?buy=ultima&months=3");
  });

  it("refuses absolute, protocol-relative and backslash targets", () => {
    const bs = String.fromCharCode(92);
    for (const bad of ["https://evil.com", "//evil.com", `/${bs}evil.com`, `/${bs}/evil.com`, "evil.com", ""]) {
      expect(safeNext(bad)).toBe("/dashboard");
    }
  });

  it("refuses control characters the URL parser would strip into //host", () => {
    expect(safeNext("/\t/evil.com")).toBe("/dashboard");
    expect(safeNext("/\n/evil.com")).toBe("/dashboard");
    expect(safeNext("/\r\n/evil.com")).toBe("/dashboard");
    expect(safeNext(decodeURIComponent("/%09/evil.com"))).toBe("/dashboard");
  });

  it("uses the given fallback", () => {
    expect(safeNext(null, "/mock")).toBe("/mock");
  });
});

describe("likeLiteral", () => {
  it("escapes LIKE wildcards so an email matches only itself", () => {
    const bs = String.fromCharCode(92);
    expect(likeLiteral("john_doe@x.com")).toBe(`john${bs}_doe@x.com`);
    expect(likeLiteral("a%b")).toBe(`a${bs}%b`);
    expect(likeLiteral(`a${bs}b`)).toBe(`a${bs}${bs}b`);
    expect(likeLiteral("plain@x.com")).toBe("plain@x.com");
  });
});
