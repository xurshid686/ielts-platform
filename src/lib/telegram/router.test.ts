import { describe, it, expect } from "vitest";
import { parseCommand } from "./router";
import { encodeCb, decodeCb, MAX_CALLBACK_BYTES } from "./callback";

describe("parseCommand", () => {
  it("parses a bare command", () => {
    expect(parseCommand("/stats")).toEqual({ name: "stats", args: "" });
  });

  it("parses a command with arguments", () => {
    expect(parseCommand("/students aziza k")).toEqual({ name: "students", args: "aziza k" });
  });

  it("strips the @botname Telegram appends in groups", () => {
    expect(parseCommand("/stats@MockOnlineBot")).toEqual({ name: "stats", args: "" });
    expect(parseCommand("/students@MockOnlineBot ali")).toEqual({
      name: "students",
      args: "ali",
    });
  });

  it("lowercases the verb and trims surrounding whitespace", () => {
    expect(parseCommand("  /START  ")).toEqual({ name: "start", args: "" });
  });

  it("returns null for ordinary text", () => {
    // Not an error: free text is how the upload wizard collects a title.
    expect(parseCommand("Cambridge 19 Reading Test 2")).toBeNull();
  });

  it("returns null for empty, missing and malformed input", () => {
    expect(parseCommand("")).toBeNull();
    expect(parseCommand(undefined)).toBeNull();
    expect(parseCommand(null)).toBeNull();
    expect(parseCommand("/")).toBeNull();
  });
});

describe("callback_data", () => {
  const uuid = "8f3a1c2e-4b5d-6e7f-8a9b-0c1d2e3f4a5b";

  it("round-trips a verb with arguments", () => {
    expect(decodeCb(encodeCb("prem", "3", uuid))).toEqual({
      verb: "prem",
      args: ["3", uuid],
    });
  });

  it("round-trips a bare verb", () => {
    expect(decodeCb(encodeCb("menu"))).toEqual({ verb: "menu", args: [] });
  });

  // The real constraint: Telegram rejects over-long callback_data with a 400,
  // which shows up as a button that silently does nothing.
  it("keeps the verbs we actually use inside the 64-byte limit", () => {
    for (const data of [
      encodeCb("stu", uuid),
      encodeCb("prem", "3", uuid),
      encodeCb("lvl", "pre_ielts", uuid),
      encodeCb("hide", "1", uuid),
      encodeCb("del2", uuid),
      encodeCb("test", uuid),
    ]) {
      expect(Buffer.byteLength(data, "utf8")).toBeLessThanOrEqual(MAX_CALLBACK_BYTES);
    }
  });

  it("throws rather than emitting an over-long payload", () => {
    expect(() => encodeCb("verb", uuid, uuid)).toThrow(/64/);
  });

  it("decodes malformed input to null instead of throwing", () => {
    expect(decodeCb("")).toBeNull();
    expect(decodeCb(undefined)).toBeNull();
    expect(decodeCb(null)).toBeNull();
  });
});
