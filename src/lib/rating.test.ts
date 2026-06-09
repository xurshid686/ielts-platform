import { describe, it, expect } from "vitest";
import {
  tierForRating,
  ratingProgress,
  expected,
  ratingDelta,
  pointsFor,
  TIERS,
} from "./rating";

describe("tiers", () => {
  it("maps boundary ratings to the right division", () => {
    expect(tierForRating(0).label).toBe("Bronze I");
    expect(tierForRating(999).label).toBe("Bronze I");
    expect(tierForRating(1000).label).toBe("Bronze II");
    expect(tierForRating(1500).label).toBe("Gold I");
    expect(tierForRating(1850).label).toBe("Platinum I");
    expect(tierForRating(2705).label).toBe("Grandmaster");
    expect(tierForRating(5000).label).toBe("Legend");
  });

  it("tier floors are strictly increasing", () => {
    for (let i = 1; i < TIERS.length; i++) {
      expect(TIERS[i].floor).toBeGreaterThan(TIERS[i - 1].floor);
    }
  });
});

describe("progress", () => {
  it("reports points to the next division and next metal", () => {
    const p = ratingProgress(1453); // Silver III (1400–1499)
    expect(p.tier.label).toBe("Silver III");
    expect(p.next?.label).toBe("Gold I");
    expect(p.toNext).toBe(47); // "47 rating points to reach Gold"
    expect(p.nextMetal?.name).toBe("Gold");
    expect(p.toNextMetal).toBe(47);
    expect(p.pct).toBe(53);
  });

  it("caps at Legend", () => {
    const p = ratingProgress(3200);
    expect(p.tier.name).toBe("Legend");
    expect(p.next).toBeNull();
    expect(p.toNext).toBe(0);
    expect(p.pct).toBe(100);
  });
});

describe("elo", () => {
  it("expected score is 0.5 when rating equals difficulty", () => {
    expect(expected(1500, 1500)).toBeCloseTo(0.5, 6);
  });

  it("a perfect run on a hard test gives a big gain to a low-rated player", () => {
    // 40/40 (acc 1.0) on a difficult test, provisional player.
    const d = ratingDelta(1000, 1600, 1.0, 0);
    expect(d).toBeGreaterThanOrEqual(30);
    expect(d).toBeLessThanOrEqual(50);
  });

  it("an average score yields a small change", () => {
    // 25/40 on a test matched to the player's rating.
    const d = ratingDelta(1500, 1500, 25 / 40, 30);
    expect(Math.abs(d)).toBeLessThanOrEqual(8);
    expect(d).toBeGreaterThan(0);
  });

  it("a poor score on an easy test loses rating", () => {
    const d = ratingDelta(1500, 1200, 10 / 40, 30);
    expect(d).toBeLessThan(0);
  });

  it("never swings more than the clamp", () => {
    expect(ratingDelta(1000, 2600, 1, 0)).toBeLessThanOrEqual(50);
    expect(ratingDelta(2600, 800, 0, 30)).toBeGreaterThanOrEqual(-40);
  });
});

describe("points", () => {
  it("are always positive and reward accuracy", () => {
    const perfect = pointsFor(1.0, 1500);
    const mid = pointsFor(0.625, 1500);
    expect(perfect).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThanOrEqual(1);
  });

  it("reward harder tests more for the same accuracy", () => {
    expect(pointsFor(1.0, 2000)).toBeGreaterThan(pointsFor(1.0, 1000));
  });
});
