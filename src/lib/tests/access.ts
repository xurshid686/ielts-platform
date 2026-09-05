// The single place that decides whether a caller may have a given test.
//
// Two routes need this and they MUST agree: /api/test-html serves the test
// file, and /api/test-key hands back its answer key after submission. If those
// two ever disagreed, the key route would become a way to read answers for a
// test you could not open — so the check lives here once and both call it.

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canAccessTest } from "@/lib/premium";
import { canAccessTrack } from "@/lib/levels";

export type TestRow = {
  file_path?: string;
  tier?: string;
  track?: string | null;
  skill?: "reading" | "listening";
  answer_key?: unknown;
};

/**
 * MAY THIS VIEWER OPEN A TEST OF THIS TRACK? The one answer, for every caller.
 *
 * `canAccessTrack()` cannot answer it alone. It compares the track against
 * `profiles.level`, and **no level is ever 'discipline'** — deliberately, since
 * Discipline membership is a table, not a level — so it returns false for every
 * non-admin and a discipline paper becomes a 404.
 *
 * That exception used to live INSIDE `resolveTestAccess`, which guards
 * /api/test-html and /api/test-key. The page — `TestDetail` — called bare
 * `canAccessTrack` instead, so from 0046 until 2026-09-05 a Discipline member
 * clicking a paper on their own programme got "not found": the paper was listed,
 * the API would have served it, and the page refused to render. Nobody saw it
 * because admins pass `canAccessTrack` unconditionally, and because every day
 * built before then used ordinary `track: 'regular'` papers, which never reach
 * this branch. The first paper uploaded through the day card — which forces
 * `track: 'discipline'` — was the first to hit it.
 *
 * So the rule lives here now and BOTH callers use it. Do not re-inline it.
 *
 * The two discipline reads use the CALLER'S client on purpose: the 0046/0047
 * RLS policies then decide, so the app and the database cannot drift, and a
 * draft day stays hidden even from a member who was handed the URL.
 */
export async function canOpenTrack({
  supabase,
  viewer,
  userId,
  track,
  testId,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  viewer: { role: string; level?: string | null };
  /** null for a signed-out visitor, who can never open a discipline paper. */
  userId: string | null;
  track: string | null | undefined;
  testId: string;
}): Promise<boolean> {
  if ((track ?? "regular") !== "discipline") return canAccessTrack(viewer, track);

  if (viewer.role === "admin") return true;
  if (!userId) return false;

  const { data: member } = await supabase
    .from("discipline_members")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!member) return false;

  // Membership is not enough: the paper must sit on a PUBLISHED day (0047).
  // An unattached discipline paper fails here too — the programme is the only
  // way into this track, which is what makes an orphaned upload invisible.
  const { data: link } = await supabase
    .from("discipline_day_tests")
    .select("day_id")
    .eq("test_id", testId)
    .limit(1)
    .maybeSingle();
  return !!link;
}

export type AccessResult =
  | { ok: true; row: TestRow; userId: string | null }
  | { ok: false; status: 403 | 404 | 502; message: string };

/**
 * Resolves a test and decides whether this request may have it.
 *
 * Anonymous callers may have FREE, regular-track tests only — that is what
 * makes the public catalogue worth anything. Everyone else is checked against
 * their membership and their level track.
 *
 * The row is read with the service-role client because `answer_key` is revoked
 * from the client roles (migration 0034).
 */
export async function resolveTestAccess(id: string): Promise<AccessResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const admin = createAdminClient();
  const testRes = await admin
    .from("tests")
    .select("file_path, tier, track, skill, answer_key")
    .eq("id", id)
    .single();

  const row = testRes.data as TestRow | null;
  if (!row?.file_path) return { ok: false, status: 404, message: "Not found" };

  if (!user) {
    if (row.tier === "premium") {
      return { ok: false, status: 403, message: "Premium membership required" };
    }
    if ((row.track ?? "regular") !== "regular") {
      return { ok: false, status: 404, message: "Not found" };
    }
    return { ok: true, row, userId: null };
  }

  const profRes = await supabase
    .from("profiles")
    .select("role, premium_until, level")
    .eq("id", user.id)
    .single();
  const profile = (profRes.data as {
    role?: string;
    premium_until?: string | null;
    level?: string | null;
  } | null) ?? { role: "student", premium_until: null, level: "regular" };

  const openable = await canOpenTrack({
    supabase,
    viewer: { role: profile.role ?? "student", level: profile.level },
    userId: user.id,
    track: row.track,
    testId: id,
  });
  if (!openable) return { ok: false, status: 404, message: "Not found" };

  if (row.tier === "premium") {
    if (
      !canAccessTest(
        { role: profile.role ?? "student", premium_until: profile.premium_until ?? null },
        { tier: "premium" },
      )
    ) {
      return { ok: false, status: 403, message: "Premium membership required" };
    }
  }

  return { ok: true, row, userId: user.id };
}

/** Downloads a test's HTML from the private bucket with the service-role client. */
export async function downloadTestHtml(filePath: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data: blob, error } = await admin.storage.from("tests").download(filePath);
  if (error || !blob) return null;
  return blob.text();
}
