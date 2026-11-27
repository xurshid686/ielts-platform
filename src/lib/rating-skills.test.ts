import { describe, expect, it } from "vitest";
import { estimatedBand, overallRating, writingRatingFromBand } from "./rating";

describe("writingRatingFromBand", () => {
  it("is the inverse of estimatedBand on the band grid", () => {
    for (const b of [5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9]) expect(estimatedBand(writingRatingFromBand(b))).toBe(b);
  });
  it("clamps", () => {
    expect(writingRatingFromBand(0)).toBe(0);
    expect(writingRatingFromBand(12)).toBe(3000);
  });
});

describe("overallRating", () => {
  const base = { rating: 1200, rated_count: 5, listening_rating: 1000, listening_rated_count: 0, writing_rating: 1000, writing_rated_count: 0 };
  it("is the only skill when one is rated", () => {
    expect(overallRating(base)).toMatchObject({ overall: 1200, rated: 1 });
  });
  it("averages rated skills", () => {
    expect(overallRating({ ...base, listening_rating: 1400, listening_rated_count: 2 }).overall).toBe(1300);
  });
  it("needs 3 essays before Writing counts", () => {
    expect(overallRating({ ...base, writing_rating: 2700, writing_rated_count: 2 }).overall).toBe(1200);
    expect(overallRating({ ...base, writing_rating: 1800, writing_rated_count: 3 }).overall).toBe(1500);
  });
  it("is null with nothing rated", () => {
    expect(overallRating({ ...base, rated_count: 0 }).overall).toBeNull();
  });
});
