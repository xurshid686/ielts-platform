import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { canAccessTrack } from "@/lib/levels";
import { testTitle, testDescription, testCanonical, type SeoTest } from "@/lib/seo";

/**
 * Loads the row a test page needs for BOTH its <head> and its JSON-LD.
 *
 * Read with the service-role client because `generateMetadata` runs without a
 * user session; only non-sensitive columns are selected, and nothing here is
 * rendered for a test the viewer cannot see (the page itself still gates).
 */
export async function loadSeoTest(
  id: string,
  skill: "reading" | "listening",
): Promise<SeoTest | null> {
  const { data } = await createAdminClient()
    .from("tests")
    .select("id, title, skill, kind, tier, passage, total, question_types, track")
    .eq("id", id)
    .eq("skill", skill)
    .single();

  const row = data as (SeoTest & { track?: string | null }) | null;
  if (!row) return null;

  // Only regular-track material is public, so only it gets indexable metadata.
  // pre_ielts / intro tests are 404 to everyone else (canAccessTrack), and must
  // not leak their titles into search results.
  if (!canAccessTrack({ role: "student", level: "regular" }, row.track ?? "regular")) {
    return null;
  }
  return row;
}

/** The <head> for a single test page. */
export async function testPageMetadata(
  id: string,
  skill: "reading" | "listening",
): Promise<Metadata> {
  const t = await loadSeoTest(id, skill);
  if (!t) return { title: "Test not found", robots: { index: false, follow: false } };

  const title = testTitle(t);
  const description = testDescription(t);
  const url = testCanonical(t);

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "article" },
    twitter: { card: "summary_large_image", title, description },
  };
}
