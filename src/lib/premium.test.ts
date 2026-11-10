import { describe, expect, it } from "vitest";
import { membershipStage } from "./premium";

const now = Date.parse("2026-11-10T12:00:00Z");
const at = (iso: string) => membershipStage(iso, now);

describe("membershipStage", () => {
  it("is none without a membership or with an unreadable date", () => {
    expect(membershipStage(null, now).stage).toBe("none");
    expect(membershipStage("not a date", now).stage).toBe("none");
  });

  it("is active with more than a week left", () => {
    expect(at("2026-12-10T12:00:00Z")).toEqual({ stage: "active", days: 30 });
    expect(at("2026-11-18T12:00:00Z")).toEqual({ stage: "active", days: 8 });
  });

  it("is expiring in the last seven days, and never says 0 days", () => {
    expect(at("2026-11-17T12:00:00Z")).toEqual({ stage: "expiring", days: 7 });
    expect(at("2026-11-10T13:00:00Z")).toEqual({ stage: "expiring", days: 1 });
  });

  it("is lapsed for thirty days after the end", () => {
    expect(at("2026-11-10T11:00:00Z")).toEqual({ stage: "lapsed", days: 0 });
    expect(at("2026-10-12T12:00:00Z")).toEqual({ stage: "lapsed", days: 29 });
  });

  it("is expired after that", () => {
    expect(at("2026-10-11T12:00:00Z")).toEqual({ stage: "expired", days: 30 });
    expect(at("2026-01-01T00:00:00Z").stage).toBe("expired");
  });
});
