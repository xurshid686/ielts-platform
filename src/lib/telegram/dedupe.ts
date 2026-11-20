// A short-memory guard against redelivered webhook updates. Pure (no imports), unit-testable.
//
// Telegram redelivers an update when it does not get a quick 200. For the teacher bot a repeat means
// a second copy of the PDF. This is in-memory on purpose: the production app runs one instance and
// Telegram retries within seconds, so a database table would add a round trip to every request for
// no gain. (The admin bot's `claimUpdate` table is keyed by update_id alone and is shared by nothing
// else; reusing it here would collide with that bot's ids, since update ids are per bot.)

export function createDedupe(ttlMs = 10 * 60 * 1000, maxEntries = 5000) {
  const seen = new Map<number, number>();
  return {
    /** True if this update id was already seen within the window; otherwise records it. */
    isRepeat(id: number, now: number = Date.now()): boolean {
      const at = seen.get(id);
      if (at !== undefined && now - at < ttlMs) return true;
      seen.set(id, now);
      if (seen.size > maxEntries) {
        for (const [k, t] of seen) {
          if (now - t >= ttlMs) seen.delete(k);
        }
        // still over the cap (a flood inside one window): drop the oldest entries
        while (seen.size > maxEntries) seen.delete(seen.keys().next().value as number);
      }
      return false;
    },
  };
}
