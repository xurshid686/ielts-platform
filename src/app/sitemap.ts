import type { MetadataRoute } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { SITE_URL } from "@/lib/site";

// Regenerate hourly; the catalogue changes when tests are uploaded, not often.
export const revalidate = 3600;

/**
 * Every public URL worth indexing.
 *
 * Only `regular` track tests are listed: pre_ielts / intro material is 404 to
 * everyone outside those tracks (canAccessTrack), so listing it would publish
 * titles for pages a crawler cannot open.
 *
 * Read with the service-role client because a sitemap has no user session.
 * Only non-sensitive columns are selected.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/reading`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/listening`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
  ];

  try {
    const { data } = await createAdminClient()
      .from("tests")
      .select("id, skill, created_at, track")
      .in("skill", ["reading", "listening"])
      .order("created_at", { ascending: false });

    const rows = (data ?? []) as {
      id: string;
      skill: "reading" | "listening";
      created_at: string;
      track: string | null;
    }[];

    const tests: MetadataRoute.Sitemap = rows
      .filter((r) => (r.track ?? "regular") === "regular")
      .map((r) => ({
        url: `${SITE_URL}/${r.skill}/${r.id}`,
        lastModified: new Date(r.created_at),
        changeFrequency: "monthly" as const,
        priority: 0.8,
      }));

    return [...staticRoutes, ...tests];
  } catch {
    // A sitemap that 500s is worse than a short one — never take the route down
    // because the database hiccuped.
    return staticRoutes;
  }
}
