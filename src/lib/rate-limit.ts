/**
 * A small in-memory, fixed-window rate limiter.
 *
 * Pure on purpose (no imports, the clock is passed in) so it is unit-testable
 * without a `@/` alias. State lives in the process: that is enough while the
 * site runs ONE DigitalOcean instance. With more than one instance each would
 * count separately, so the effective limit becomes limit x instances; move the
 * counters to the database if that ever matters.
 */

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the caller's window resets (0 when allowed). */
  retryAfterSeconds: number;
}

interface Window {
  count: number;
  resetAt: number;
}

export interface RateLimiter {
  check(key: string, now?: number): RateLimitResult;
  /** Number of keys currently tracked (for tests). */
  size(): number;
}

export function createRateLimiter(opts: {
  limit: number;
  windowMs: number;
  /** Hard cap on tracked keys, so a flood of distinct keys cannot grow memory. */
  maxKeys?: number;
}): RateLimiter {
  const { limit, windowMs } = opts;
  const maxKeys = opts.maxKeys ?? 10_000;
  const windows = new Map<string, Window>();

  function sweep(now: number) {
    for (const [k, w] of windows) {
      if (w.resetAt <= now) windows.delete(k);
    }
    // Still over the cap after dropping expired windows: drop the oldest
    // entries (Map iterates in insertion order).
    for (const k of windows.keys()) {
      if (windows.size < maxKeys) break;
      windows.delete(k);
    }
  }

  return {
    check(key, now = Date.now()) {
      let w = windows.get(key);
      if (!w || w.resetAt <= now) {
        if (windows.size >= maxKeys) sweep(now);
        w = { count: 0, resetAt: now + windowMs };
        windows.set(key, w);
      }
      w.count += 1;
      if (w.count > limit) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((w.resetAt - now) / 1000)),
        };
      }
      return { allowed: true, retryAfterSeconds: 0 };
    },
    size: () => windows.size,
  };
}

/**
 * The caller's address as the hosting proxy reports it.
 *
 * The FIRST `x-forwarded-for` entry is whatever the client put there whenever
 * a proxy appends rather than replaces, so it is the last resort, not the
 * first choice (security audit 2026-11-25: rotating a fake XFF dodged the
 * guest-grade and /a/<code> limits). Headers the platform itself sets win:
 *  - `do-connecting-ip` — DigitalOcean App Platform (mockonline.uz);
 *  - `x-real-ip` — Vercel.
 * Falls back to one shared bucket rather than skipping the limit.
 */
export function clientIp(headers: Headers): string {
  const platform = headers.get("do-connecting-ip")?.trim() || headers.get("x-real-ip")?.trim();
  if (platform) return platform;
  const first = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return first || "unknown";
}
