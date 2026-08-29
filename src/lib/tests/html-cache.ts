/**
 * An in-process cache for test HTML downloaded from Supabase Storage.
 *
 * Opening a test is the click students actually wait on, and every open used to
 * re-download the whole file from Storage. The bytes for a given `file_path`
 * never change: `uploadTest` writes each upload to a fresh
 * `${skill}/${crypto.randomUUID()}.html` (see `actions/admin.ts`), so a
 * re-upload produces a NEW path and can never collide with a cached entry.
 * That makes the path a safe cache key with no invalidation hook to forget.
 *
 * What is deliberately NOT cached:
 *
 *   - Entitlement. `resolveTestAccess(id)` still runs on every request, so the
 *     cache can never hand a test to someone who may not open it.
 *   - The sanitized output. Only the RAW download is kept; sanitizing and
 *     bridge injection re-run per request, which keeps the fail-closed
 *     `SanitizeIncompleteError` check and the request's own origin live. The
 *     answer key must never be resident in a cache.
 *
 * Scope is one server process. Instances do not share it and it dies with a
 * deploy, which is fine — a miss just costs the download it used to always pay.
 */

const TTL_MS = 15 * 60 * 1000;

// Kept small on purpose: App Platform containers here run on 512 MiB–1 GiB, and
// a runaway cache is a worse bug than a slow download.
const MAX_TOTAL_BYTES = 32 * 1024 * 1024;
const MAX_ENTRY_BYTES = 6 * 1024 * 1024;

type Entry = { html: string; bytes: number; expiresAt: number };

// Map preserves insertion order, which gives LRU eviction for free: re-inserting
// on a hit moves an entry to the end, so the oldest key is always first.
const store = new Map<string, Entry>();
let totalBytes = 0;

function drop(key: string) {
  const hit = store.get(key);
  if (!hit) return;
  totalBytes -= hit.bytes;
  store.delete(key);
}

/** The cached file, or null on a miss or an expired entry. */
export function getCachedTestHtml(filePath: string): string | null {
  const hit = store.get(filePath);
  if (!hit) return null;

  if (Date.now() > hit.expiresAt) {
    drop(filePath);
    return null;
  }

  // Refresh recency for the LRU order.
  store.delete(filePath);
  store.set(filePath, hit);
  return hit.html;
}

export function setCachedTestHtml(filePath: string, html: string): void {
  // Byte length, not string length — these files carry non-ASCII passage text.
  const bytes = Buffer.byteLength(html, "utf8");

  // An outlier file is served normally, just never cached: admitting it would
  // evict everything else to hold one entry.
  if (bytes > MAX_ENTRY_BYTES) return;

  drop(filePath);
  store.set(filePath, { html, bytes, expiresAt: Date.now() + TTL_MS });
  totalBytes += bytes;

  while (totalBytes > MAX_TOTAL_BYTES) {
    const oldest = store.keys().next();
    if (oldest.done) break;
    drop(oldest.value);
  }
}

/** Test seam — lets a unit test start from a known empty cache. */
export function clearTestHtmlCache(): void {
  store.clear();
  totalBytes = 0;
}
