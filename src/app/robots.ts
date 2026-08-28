import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * Crawl the public catalogue and the test pages; stay out of everything that
 * needs an account or serves content.
 *
 * `/api/` matters most: /api/test-html serves the test file itself, and it is
 * both entitlement-gated and `no-store`. There is nothing there for a crawler
 * but load.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/admin",
          "/dashboard",
          "/reports",
          "/review",
          "/badges",
          "/refer",
          "/u/",
          "/auth/",
          "/login",
          "/register",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
