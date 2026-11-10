import { describe, expect, it } from "vitest";
import { clientIp, createRateLimiter } from "./rate-limit";

describe("createRateLimiter", () => {
  it("allows up to the limit, then refuses with a retry time", () => {
    const rl = createRateLimiter({ limit: 3, windowMs: 60_000 });
    expect(rl.check("a", 0).allowed).toBe(true);
    expect(rl.check("a", 1).allowed).toBe(true);
    expect(rl.check("a", 2).allowed).toBe(true);
    const refused = rl.check("a", 30_000);
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterSeconds).toBe(30);
  });

  it("counts each key on its own", () => {
    const rl = createRateLimiter({ limit: 1, windowMs: 1000 });
    expect(rl.check("a", 0).allowed).toBe(true);
    expect(rl.check("b", 0).allowed).toBe(true);
    expect(rl.check("a", 1).allowed).toBe(false);
  });

  it("opens a fresh window once the old one has passed", () => {
    const rl = createRateLimiter({ limit: 1, windowMs: 1000 });
    expect(rl.check("a", 0).allowed).toBe(true);
    expect(rl.check("a", 999).allowed).toBe(false);
    expect(rl.check("a", 1000).allowed).toBe(true);
  });

  it("never tracks more keys than the cap", () => {
    const rl = createRateLimiter({ limit: 5, windowMs: 60_000, maxKeys: 10 });
    for (let i = 0; i < 100; i++) rl.check(`k${i}`, i);
    expect(rl.size()).toBeLessThanOrEqual(10);
  });
});

describe("clientIp", () => {
  it("takes the first forwarded address", () => {
    const h = new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" });
    expect(clientIp(h)).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip, then to a shared bucket", () => {
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
