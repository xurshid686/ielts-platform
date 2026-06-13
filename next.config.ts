import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Full tests (esp. listening with embedded audio) are larger than the
    // 1 MB default Server Action body limit, which made uploads 500.
    serverActions: { bodySizeLimit: "8mb" },
  },
};

export default nextConfig;
