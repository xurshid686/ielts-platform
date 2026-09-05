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

  // The Discipline track is gated by MEMBERSHIP, not by profile.level, so it
  // cannot go through canAccessTrack — which would (correctly) 404 it for
  // everyone. Checked here, in the one place both /api/test-html and
  // /api/test-key defer to, so the two can never disagree.
  if ((row.track ?? "regular") === "discipline") {
    if (profile.role !== "admin") {
      const { data: member } = await supabase
        .from("discipline_members")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!member) return { ok: false, status: 404, message: "Not found" };

      // Membership is not enough: the paper must also sit on a day that has
      // been PUBLISHED (0047). Read with the CALLER'S client, so the RLS policy
      // on discipline_day_tests — which already hides links to draft days — is
      // what decides, and a draft paper cannot be opened from a guessed URL by
      // a member who was shown it in a screenshot.
      const { data: link } = await supabase
        .from("discipline_day_tests")
        .select("day_id")
        .eq("test_id", id)
        .limit(1)
        .maybeSingle();
      if (!link) return { ok: false, status: 404, message: "Not found" };
    }
  } else if (
    !canAccessTrack({ role: profile.role ?? "student", level: profile.level }, row.track)
  ) {
    return { ok: false, status: 404, message: "Not found" };
  }

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
