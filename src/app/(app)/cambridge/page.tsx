import type { Metadata } from "next";
import { Library } from "lucide-react";
import { getProfile, isCambridgeMember } from "@/lib/auth";
import { countCambridgeTests, getRequestFor } from "@/lib/cambridge";
import { CambridgeSection } from "@/components/sections/cambridge-section";
import { CambridgeLocked, type RequestState } from "@/components/sections/cambridge-locked";

/**
 * NOINDEX, and it is not optional.
 *
 * Everything else about this page is public — a logged-out visitor is meant to
 * land here and see that the section exists — but the material is copyrighted,
 * so the page must never enter a search index. `follow: false` too: there is
 * nothing here worth crawling onwards to, and every Cambridge test page is a
 * 404 to a crawler anyway (canOpenTrack refuses an anonymous caller).
 *
 * The track filter already keeps these papers out of the sitemap, the
 * catalogue, RelatedTests and TestIndexLinks. This is the last door.
 */
export const metadata: Metadata = {
  title: "Cambridge tests",
  robots: { index: false, follow: false },
};

/**
 * The Cambridge section.
 *
 * PUBLIC, and deliberately absent from `PROTECTED` in src/proxy.ts: a student
 * cannot ask for something they cannot see exists. What a non-member gets is a
 * teaser built from a COUNT — no real titles reach the browser — plus a request
 * button. Compare Discipline, which hides itself entirely, because nobody is
 * meant to request a place there.
 */
export default async function CambridgePage() {
  const profile = await getProfile();

  // Admins see the real catalogue so they can check what they have uploaded —
  // the same courtesy canOpenTrack() gives them at the content gate.
  const approved = !!profile && (profile.role === "admin" || (await isCambridgeMember(profile.id)));

  const [counts, request] = await Promise.all([
    approved ? Promise.resolve(null) : countCambridgeTests(),
    profile && !approved ? getRequestFor(profile.id) : Promise.resolve(null),
  ]);

  // An approved request cannot reach here (that student is a member), so the
  // only states a locked viewer can be in are these three.
  const state: RequestState =
    request?.status === "pending" ? "pending" : request?.status === "rejected" ? "rejected" : "none";

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Library className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Cambridge</h1>
          <p className="text-muted">
            Real Cambridge IELTS papers, scored the same way as the rest of the site.
          </p>
        </div>
      </div>

      {approved && profile ? (
        <CambridgeSection profile={profile} />
      ) : (
        <CambridgeLocked counts={counts!} signedIn={!!profile} state={state} />
      )}
    </div>
  );
}
