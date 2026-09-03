import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { isUuidRef, USE_SLUG_URLS } from "./ref";

/**
 * The slug path a uuid URL should redirect to, or null if it should just render.
 *
 * MUST BE CALLED FROM THE PAGE ITSELF, before anything renders. `redirect()`
 * only produces a real HTTP 308 while the response is unstarted; called from a
 * component deeper in the tree — where the first version of this lived — Next
 * has already begun streaming and downgrades it to a client-side
 * `<meta http-equiv="refresh">`. That still moves a browser, but it means the
 * uuid URL answers 200 with a full copy of the page, which is precisely the
 * duplicate Google must not see. Verified by curl: 200 + a meta refresh from
 * inside `TestDetail`, 308 from the page.
 *
 * Uses the service-role client because it runs before the page's own gates and
 * needs no session; it reads nothing but the slug, which is public by
 * definition.
 *
 * Returns null on any failure — an unresolvable ref falls through to the page,
 * which does the real lookup and renders the proper not-found.
 */
export async function canonicalRedirectFor(
  skill: "reading" | "listening",
  ref: string,
): Promise<string | null> {
  if (!USE_SLUG_URLS || !isUuidRef(ref)) return null;

  try {
    const { data } = await createAdminClient()
      .from("tests")
      .select("id, slug")
      .eq("id", ref)
      .eq("skill", skill)
      .single();

    const slug = (data as { slug: string | null } | null)?.slug;
    return slug ? `/${skill}/${slug}` : null;
  } catch {
    return null;
  }
}
