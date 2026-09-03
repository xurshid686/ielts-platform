import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { TablesInsert } from "@/types/database";
import { extractAnswerKey } from "@/lib/ielts/extract-key";

// The one place a test row and its storage object are created.
//
// Lifted out of uploadTest() in app/actions/admin.ts so the Telegram bot can
// publish a paper without going through a FormData server action. The action
// keeps its own concerns — the admin gate, parsing the form, revalidating the
// cache — and delegates the middle to this.
//
// Everything here is authorisation-free ON PURPOSE: it is a library, and both
// callers gate before they call (assertAdmin() in the action, the webhook's
// owner check in the bot). Do not call it from anywhere that has not.

export type Skill = "reading" | "listening";
export type Kind = "single" | "full";
export type Tier = "free" | "premium";
export type Track = "regular" | "pre_ielts" | "intro" | "discipline";

export type CreateTestInput = {
  title: string;
  skill: Skill;
  kind: Kind;
  tier: Tier;
  track: Track;
  questionTypes: string[];
  level: string | null;
  passage: number | null;
  /** The paper's HTML. Used both to read the key and as the stored object. */
  html: string;
  createdBy: string;
};

export type CreateTestResult =
  | { ok: true; id: string; total: number; path: string }
  | { ok: false; error: string };

/**
 * The message shown when a paper carries no answer key.
 *
 * Exported so the Telegram bot and the web form say the same thing, and so a
 * test can assert on it. The wording matters: it explains WHY the platform
 * refuses rather than just that it did.
 */
export const NO_KEY_ERROR =
  "No answer key could be read from this file. The platform grades server-side, so a test without a key would ship its answers to the browser. Check the file's correctAnswers block.";

export async function createTestFromHtml(input: CreateTestInput): Promise<CreateTestResult> {
  const {
    title,
    skill,
    kind,
    tier,
    track,
    questionTypes,
    level,
    passage,
    html,
    createdBy,
  } = input;

  // Extract the key now so the platform can grade this test server-side. A test
  // WITHOUT a key cannot be served sanitized (see /api/test-html), which means
  // its answers stay readable in the page — so refuse the upload rather than
  // quietly publishing a test that gives itself away.
  const extracted = extractAnswerKey(html);
  if (!extracted) return { ok: false, error: NO_KEY_ERROR };

  // Two tests of the same skill must never share a title. Not cosmetic:
  // scripts/upload-listening.mjs and upload-premium-batch.mjs both run
  // `delete().eq("title", …)` before inserting, so a duplicate title means the
  // next re-upload quietly deletes the wrong row. renameTest() enforces the
  // same rule; creation used not to, which left the hole open at the only
  // moment a duplicate can be introduced.
  const db = createAdminClient();
  const { data: clash } = await db
    .from("tests")
    .select("id")
    .eq("skill", skill)
    .eq("title", title)
    .limit(1);
  if (Array.isArray(clash) && clash.length > 0) {
    return { ok: false, error: `Another ${skill} test is already called "${title}".` };
  }

  const path = `${skill}/${crypto.randomUUID()}.html`;

  const { error: upErr } = await db.storage
    .from("tests")
    .upload(path, new Blob([html], { type: "text/html" }), {
      contentType: "text/html",
      upsert: false,
    });
  if (upErr) return { ok: false, error: `Upload failed: ${upErr.message}` };

  // `file_url` used to hold getPublicUrl(path). The bucket is private as of
  // migration 0035, so that link is dead — and while it worked it was a
  // standing invitation to download the unsanitized file, answer key included.
  // The column is `not null` and predates the gated routes, so it is kept and
  // filled with the storage path. Nothing reads it: delivery is
  // /api/test-html -> createAdminClient().storage.download(file_path).
  const row: TablesInsert<"tests"> = {
    title,
    skill,
    kind,
    tier,
    question_types: questionTypes,
    level,
    track,
    passage,
    file_url: path, // vestigial; see note above
    file_path: path,
    answer_key: extracted.key,
    total: extracted.total,
    created_by: createdBy,
  };

  const { data: inserted, error: insErr } = await db
    .from("tests")
    .insert(row)
    .select("id")
    .single();

  if (insErr) {
    // Best-effort cleanup of the orphaned object. The row is what makes a test
    // exist, so failing here leaves storage cost and nothing else.
    await db.storage.from("tests").remove([path]);
    return { ok: false, error: `Saving test failed: ${insErr.message}` };
  }

  return {
    ok: true,
    id: (inserted as { id: string }).id,
    total: extracted.total,
    path,
  };
}
