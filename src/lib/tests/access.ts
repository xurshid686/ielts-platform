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
  let testRes = await admin
    .from("tests")
    .select("file_path, tier, track, skill, answer_key")
    .eq("id", id)
    .single();
  if (testRes.error && /track/.test(testRes.error.message)) {
    testRes = await admin
      .from("tests")
      .select("file_path, tier, skill, answer_key")
      .eq("id", id)
      .single();
  }

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

  let profRes = await supabase
    .from("profiles")
    .select("role, premium_until, level")
    .eq("id", user.id)
    .single();
  if (profRes.error && /level/.test(profRes.error.message)) {
    profRes = await supabase
      .from("profiles")
      .select("role, premium_until")
      .eq("id", user.id)
      .single();
  }
  const profile = (profRes.data as {
    role?: string;
    premium_until?: string | null;
    level?: string | null;
  } | null) ?? { role: "student", premium_until: null, level: "regular" };

  if (!canAccessTrack({ role: profile.role ?? "student", level: profile.level }, row.track)) {
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
