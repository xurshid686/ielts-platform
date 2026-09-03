import { describe, it, expect } from "vitest";
import { isUuidRef, refColumn, testPath, USE_SLUG_URLS } from "./ref";

describe("isUuidRef", () => {
  it("recognises a real test id in either case", () => {
    expect(isUuidRef("3fa98a00-00b3-4255-8739-d8828c872d16")).toBe(true);
    expect(isUuidRef("3FA98A00-00B3-4255-8739-D8828C872D16")).toBe(true);
  });

  it("treats every slug as a slug", () => {
    for (const s of [
      "the-voynich-manuscript",
      "volume-7-test-1",
      "why-dont-we-sleep",
      "the-voynich-manuscript-2",
      // A slug that opens with hex and hyphens is still not a uuid.
      "3fa98a00-00b3-4255-8739-d8828c872d16-extra",
      "cafe-babe",
    ]) {
      expect(isUuidRef(s), s).toBe(false);
    }
  });
});

describe("refColumn", () => {
  it("routes each form at the column that holds it", () => {
    expect(refColumn("3fa98a00-00b3-4255-8739-d8828c872d16")).toBe("id");
    expect(refColumn("the-voynich-manuscript")).toBe("slug");
  });
});

describe("testPath", () => {
  // Pinned to whichever side of the switch the site is currently on, so that
  // flipping USE_SLUG_URLS fails here loudly rather than silently changing
  // every public url. See the comment on the flag.
  it(`emits ${USE_SLUG_URLS ? "slug" : "uuid"} urls, matching USE_SLUG_URLS`, () => {
    expect(testPath("reading", { id: "abc", slug: "the-voynich-manuscript" })).toBe(
      USE_SLUG_URLS ? "/reading/the-voynich-manuscript" : "/reading/abc",
    );
  });

  it("falls back to the id so a row with no slug stays reachable", () => {
    // `slug` is nullable: a row predating 0044's trigger, or inserted by a path
    // that bypassed it, must not be linked to a 404.
    expect(testPath("listening", { id: "abc", slug: null })).toBe("/listening/abc");
    expect(testPath("listening", { id: "abc" })).toBe("/listening/abc");
    expect(testPath("listening", { id: "abc", slug: "" })).toBe("/listening/abc");
  });
});

describe("both url forms resolve regardless of the flag", () => {
  it("routes a uuid at id and a slug at slug", () => {
    // This is what makes the switch safe to flip in either direction: a link
    // already shared in the other form still finds its row.
    expect(refColumn("3fa98a00-00b3-4255-8739-d8828c872d16")).toBe("id");
    expect(refColumn("the-return-of-the-black-footed-ferret")).toBe("slug");
  });
});
