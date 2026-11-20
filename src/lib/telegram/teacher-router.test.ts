import { describe, expect, it } from "vitest";
import { buildPdfPayload, parseStart } from "./teacher-router";

const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";

describe("parseStart", () => {
  it("reads a bare pdf link", () => {
    expect(parseStart(`/start pdf_${ID}`)).toEqual({ kind: "pdf", testId: ID, code: null });
  });
  it("reads a pdf link with a link code", () => {
    expect(parseStart(`/start pdf_${ID}_Ab3dEf6hIj9L`)).toEqual({ kind: "pdf", testId: ID, code: "Ab3dEf6hIj9L" });
  });
  it("accepts the @botname form and lowercases the id", () => {
    expect(parseStart(`/start@TeacherBot pdf_${ID.toUpperCase()}`)).toEqual({ kind: "pdf", testId: ID, code: null });
  });
  it("ignores everything else", () => {
    expect(parseStart("/start")).toEqual({ kind: "none" });
    expect(parseStart("hello")).toEqual({ kind: "none" });
    expect(parseStart(undefined)).toEqual({ kind: "none" });
    expect(parseStart(`/start pdf_${ID}_short`)).toEqual({ kind: "none" });
    expect(parseStart(`/start pdf_not-a-uuid`)).toEqual({ kind: "none" });
    expect(parseStart(`/start xyz_${ID}`)).toEqual({ kind: "none" });
  });
});

describe("buildPdfPayload", () => {
  it("fits Telegram's 64-character cap with a code", () => {
    expect(buildPdfPayload(ID, "Ab3dEf6hIj9L").length).toBeLessThanOrEqual(64);
    expect(parseStart(`/start ${buildPdfPayload(ID, "Ab3dEf6hIj9L")}`)).toEqual({
      kind: "pdf",
      testId: ID,
      code: "Ab3dEf6hIj9L",
    });
  });
});
