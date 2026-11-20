// Retry policy for Telegram's "slow down" reply (HTTP 429 with parameters.retry_after seconds).
// Pure (no imports), so it is unit-testable with a fake sleep.
//
// Telegram lets a bot send roughly 30 messages a second overall. A burst of requests (a class of
// teachers pressing the button at once) can hit that ceiling; the right response is to wait the time
// Telegram names and try again, not to fail the teacher's request.

export type Attempt<T> = { status: number; retryAfter?: number; data: T };

export async function with429Retry<T>(
  fn: () => Promise<Attempt<T>>,
  opts: { maxTries?: number; maxWaitMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<Attempt<T>> {
  const maxTries = opts.maxTries ?? 3;
  const maxWait = opts.maxWaitMs ?? 10_000;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let last = await fn();
  for (let i = 1; i < maxTries && last.status === 429; i++) {
    const wait = Math.min(((last.retryAfter ?? 1) + 0.5) * 1000, maxWait);
    await sleep(wait);
    last = await fn();
  }
  return last;
}
