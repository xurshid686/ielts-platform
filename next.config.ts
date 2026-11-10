import type { NextConfig } from "next";

// Sent on every response. Deliberately NO Content-Security-Policy here: the CDI
// test files are built on inline scripts and the answer-key restore evaluates
// source on the parent origin, so a CSP needs its own round of player testing.
const securityHeaders = [
  // HTTPS only for a year. No `includeSubDomains` / `preload`: other names
  // under mockonline.uz are DNS-only records we do not serve.
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The test player iframe is served from our own origin, so SAMEORIGIN keeps
  // it working while stopping other sites from framing ours.
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // Speaking needs the microphone (this origin only). Fullscreen is left at
  // the browser default because the mock exam requires it.
  { key: "Permissions-Policy", value: "microphone=(self), camera=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    // Full tests (esp. listening with embedded audio) are larger than the
    // 1 MB default Server Action body limit, which made uploads 500.
    serverActions: { bodySizeLimit: "8mb" },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
