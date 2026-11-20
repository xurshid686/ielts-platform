import { describe, expect, it } from "vitest";
import { createDedupe } from "./dedupe";
import { with429Retry, type Attempt } from "./retry";

describe("createDedupe", () => {
  it("lets a new id through once and rejects the repeat", () => {
    const d = createDedupe(1000);
    expect(d.isRepeat(1, 0)).toBe(false);
    expect(d.isRepeat(1, 500)).toBe(true);
    expect(d.isRepeat(2, 500)).toBe(false);
  });
  it("forgets an id after the window", () => {
    const d = createDedupe(1000);
    d.isRepeat(1, 0);
    expect(d.isRepeat(1, 1500)).toBe(false);
  });
  it("stays bounded under a flood", () => {
    const d = createDedupe(60_000, 10);
    for (let i = 0; i < 100; i++) d.isRepeat(i, i);
    // the newest id is still remembered, the oldest was dropped
    expect(d.isRepeat(99, 100)).toBe(true);
    expect(d.isRepeat(0, 100)).toBe(false);
  });
});

describe("with429Retry", () => {
  const ok = (): Attempt<string> => ({ status: 200, data: "ok" });
  const slow = (s: number): Attempt<string> => ({ status: 429, retryAfter: s, data: "slow" });

  it("returns immediately on success", async () => {
    const waits: number[] = [];
    const r = await with429Retry(async () => ok(), { sleep: async (ms) => void waits.push(ms) });
    expect(r.data).toBe("ok");
    expect(waits).toEqual([]);
  });
  it("waits the time Telegram names (plus a margin) and retries", async () => {
    const queue = [slow(2), ok()];
    const waits: number[] = [];
    const r = await with429Retry(async () => queue.shift()!, { sleep: async (ms) => void waits.push(ms) });
    expect(r.data).toBe("ok");
    expect(waits).toEqual([2500]);
  });
  it("caps the wait and gives up after maxTries", async () => {
    const waits: number[] = [];
    let calls = 0;
    const r = await with429Retry(
      async () => {
        calls++;
        return slow(60);
      },
      { maxTries: 3, maxWaitMs: 10_000, sleep: async (ms) => void waits.push(ms) },
    );
    expect(r.status).toBe(429);
    expect(calls).toBe(3);
    expect(waits).toEqual([10_000, 10_000]);
  });
  it("does not retry other errors", async () => {
    let calls = 0;
    const r = await with429Retry(async () => {
      calls++;
      return { status: 400, data: "bad" };
    });
    expect(r.status).toBe(400);
    expect(calls).toBe(1);
  });
});
