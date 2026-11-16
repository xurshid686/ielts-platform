import { describe, expect, it } from "vitest";
import { estimatedMinutes } from "./estimated-minutes";

describe("estimatedMinutes", () => {
  it("uses the exam allowance for reading", () => {
    expect(estimatedMinutes("reading", "single")).toBe(20);
    expect(estimatedMinutes("reading", "full")).toBe(60);
  });

  it("uses the recording length for listening", () => {
    expect(estimatedMinutes("listening", "single")).toBe(10);
    expect(estimatedMinutes("listening", "full")).toBe(40);
  });
});
