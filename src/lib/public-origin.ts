/**
 * The origin the BROWSER used to reach us — not the one the container sees.
 *
 * `new URL(request.url).origin` is only trustworthy when the platform rewrites
 * the request URL to the public address. Vercel does. DigitalOcean App Platform
 * does not: the container listens on port 8080 behind their proxy, so
 * `request.url` comes back as `https://localhost:8080` and every absolute URL
 * built from it points nowhere.
 *
 * That produced two live bugs on the DigitalOcean deployment:
 *
 *   - /auth/callback redirected to `https://localhost:8080/dashboard` after a
 *     successful Google sign-in, so login appeared to fail.
 *   - /api/test-html baked `ORIGIN = "https://localhost:8080"` into the scoring
 *     bridge. The iframe posts its answers with that as the postMessage target
 *     origin, so the parent never received them and submitting a test did
 *     nothing at all — the exact regression CLAUDE.md warns about.
 *
 * Order of trust:
 *   1. `x-forwarded-host` / `x-forwarded-proto` — set by the platform proxy.
 *   2. `host` — correct when the app is addressed directly.
 *   3. `NEXT_PUBLIC_SITE_URL` — the configured public address.
 *   4. the request's own origin, as a last resort.
 *
 * Any candidate that resolves to localhost is skipped: on a deployed host it is
 * never the address a browser used, and accepting it is the bug this exists to
 * prevent. Locally, `request.url` IS localhost and correctly wins at step 4.
 */
export function publicOrigin(request: Request): string {
  const h = request.headers;

  // A proxy may send a comma-separated list; the first entry is the client's.
  const first = (v: string | null) => v?.split(",")[0]?.trim() || null;

  const proto = first(h.get("x-forwarded-proto")) ?? "https";
  for (const host of [first(h.get("x-forwarded-host")), first(h.get("host"))]) {
    if (host && !isLoopback(host)) return `${proto}://${host}`;
  }

  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured && !isLoopback(configured)) return configured.replace(/\/+$/, "");

  return new URL(request.url).origin;
}

function isLoopback(value: string): boolean {
  return /(^|\/\/)(localhost|127\.0\.0\.1|\[::1\])(:|$|\/)/i.test(value);
}
