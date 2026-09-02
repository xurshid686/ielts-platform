import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { SITE_URL } from "@/lib/site";
import { inferQuestionTypes } from "@/lib/ielts/infer-question-types";
import { extractAnswerKey } from "@/lib/ielts/extract-key";
import {
  createTestFromHtml,
  NO_KEY_ERROR,
  type Skill,
  type Kind,
  type Tier,
  type Track,
} from "@/lib/tests/create";
import { getFile, downloadFile } from "../api";
import { escapeHtml, clamp, num } from "../format";
import { encodeCb } from "../callback";
import { setSession, clearSession, type Session } from "../state";
import type { InlineKeyboard, TelegramDocument } from "../types";

// Publishing a paper from a Telegram document.
//
// The flow deliberately starts with the FILE, not with the questions: the file
// decides whether there is anything to publish at all (no answer key, no
// upload), and asking six questions before discovering that would waste the
// owner's time. Question types are inferred, never asked.

/** Telegram will not let a bot download a file larger than this. */
const MAX_FILE_BYTES = 20 * 1024 * 1024;

export const UPLOAD_PROMPT = clamp(
  [
    "⬆️ <b>Upload a test</b>",
    "",
    "Send the CDI <b>.html</b> file as a <b>document</b> — not pasted as text, and not as a photo.",
    "",
    "<i>I read the answer key out of the file, work out the question types, then ask a few things and publish. /cancel to stop.</i>",
  ].join("\n"),
);

type Draft = {
  html: string;
  filename: string;
  total: number;
  types: string[];
  needsReview: boolean;
  title?: string;
  skill?: Skill;
  kind?: Kind;
  tier?: Tier;
  track?: Track;
  passage?: number | null;
};

function draftOf(session: Session | null): Draft | null {
  const d = session?.data as Draft | undefined;
  return d && typeof d.html === "string" ? d : null;
}

/**
 * Step 1 — the document arrives.
 *
 * Returns the message to show. The heavy work (download, key extraction) all
 * happens here so a file that cannot be published is rejected before the owner
 * answers a single question.
 */
export async function receiveDocument(
  chatId: number,
  doc: TelegramDocument,
): Promise<{ text: string; keyboard?: InlineKeyboard }> {
  const name = doc.file_name ?? "";

  // Telegram very often sends .html as application/octet-stream, so the mime
  // type alone is not a usable check. This mirrors the web form's rule:
  // the extension OR a text/html mime is enough.
  if (!name.toLowerCase().endsWith(".html") && doc.mime_type !== "text/html") {
    return { text: "That is not a .html file. Send the CDI HTML file as a document." };
  }

  if (typeof doc.file_size === "number" && doc.file_size > MAX_FILE_BYTES) {
    return {
      text: `That file is ${(doc.file_size / 1048576).toFixed(1)} MB. Telegram will not let a bot download anything over 20 MB — upload it through /admin/tests instead.`,
    };
  }

  const info = await getFile(doc.file_id);
  if (!info.ok || !info.value.file_path) {
    return { text: `Could not fetch that file: ${escapeHtml(info.ok ? "no path" : info.error)}` };
  }

  const dl = await downloadFile(info.value.file_path);
  if (!dl.ok) return { text: `Download failed: ${escapeHtml(dl.error)}` };

  const html = dl.value;

  // The same refusal the web form gives, for the same reason: a test with no
  // key cannot be served sanitized, so publishing it would ship its answers.
  const key = extractAnswerKey(html);
  if (!key) return { text: `❌ ${escapeHtml(NO_KEY_ERROR)}` };

  const inferred = inferQuestionTypes(html);

  const draft: Draft = {
    html,
    filename: name,
    total: key.total,
    types: inferred.types,
    needsReview: inferred.needsReview,
  };
  await setSession(chatId, "await_skill", draft as unknown as Record<string, unknown>);

  return {
    text: clamp(
      [
        `✅ <b>${escapeHtml(name)}</b>`,
        `Answer key found: <b>${num(key.total)}</b> questions.`,
        inferred.types.length
          ? `Question types: <i>${escapeHtml(inferred.types.join(", "))}</i>`
          : "Question types: <i>none detected</i>",
        inferred.needsReview ? "⚠️ <i>Types are ambiguous — worth checking after upload.</i>" : "",
        "",
        "Which skill is this?",
      ]
        .filter(Boolean)
        .join("\n"),
    ),
    keyboard: [
      [
        { text: "📖 Reading", callback_data: encodeCb("up", "skill", "reading") },
        { text: "🎧 Listening", callback_data: encodeCb("up", "skill", "listening") },
      ],
      [{ text: "Cancel", callback_data: encodeCb("menu") }],
    ],
  };
}

/** Step 2+ — a wizard button was tapped. */
export async function advance(
  chatId: number,
  session: Session | null,
  field: string,
  value: string,
): Promise<{ text: string; keyboard?: InlineKeyboard; done?: boolean }> {
  const draft = draftOf(session);
  if (!draft) {
    return { text: "That upload has expired. Send the file again.", keyboard: undefined };
  }

  const next: Draft = { ...draft };
  switch (field) {
    case "skill":
      next.skill = value === "listening" ? "listening" : "reading";
      break;
    case "kind":
      next.kind = value === "full" ? "full" : "single";
      break;
    case "passage":
      next.passage = value === "skip" ? null : Number(value);
      break;
    case "tier":
      next.tier = value === "premium" ? "premium" : "free";
      break;
    case "track":
      next.track = (["regular", "pre_ielts", "intro"] as const).includes(value as Track)
        ? (value as Track)
        : "regular";
      break;
  }

  return askNext(chatId, next);
}

/** Ask for whichever field is still missing, in a fixed order. */
async function askNext(
  chatId: number,
  draft: Draft,
): Promise<{ text: string; keyboard?: InlineKeyboard; done?: boolean }> {
  const cancel = { text: "Cancel", callback_data: encodeCb("menu") };

  if (!draft.kind) {
    await setSession(chatId, "await_kind", draft as unknown as Record<string, unknown>);
    return {
      text: "Is this one passage/part, or a full test?",
      keyboard: [
        [
          { text: "Single", callback_data: encodeCb("up", "kind", "single") },
          { text: "Full test", callback_data: encodeCb("up", "kind", "full") },
        ],
        [cancel],
      ],
    };
  }

  // A passage number only means anything for a single reading passage — the
  // same rule the web form applies.
  if (draft.skill === "reading" && draft.kind === "single" && draft.passage === undefined) {
    await setSession(chatId, "await_passage", draft as unknown as Record<string, unknown>);
    return {
      text: "Which passage number?",
      keyboard: [
        [
          { text: "1", callback_data: encodeCb("up", "passage", "1") },
          { text: "2", callback_data: encodeCb("up", "passage", "2") },
          { text: "3", callback_data: encodeCb("up", "passage", "3") },
          { text: "Skip", callback_data: encodeCb("up", "passage", "skip") },
        ],
        [cancel],
      ],
    };
  }

  if (!draft.tier) {
    await setSession(chatId, "await_tier", draft as unknown as Record<string, unknown>);
    return {
      text: "Free or premium?",
      keyboard: [
        [
          { text: "Free", callback_data: encodeCb("up", "tier", "free") },
          { text: "👑 Premium", callback_data: encodeCb("up", "tier", "premium") },
        ],
        [cancel],
      ],
    };
  }

  if (!draft.track) {
    await setSession(chatId, "await_track", draft as unknown as Record<string, unknown>);
    return {
      text: "Which track?",
      keyboard: [
        [
          { text: "Regular", callback_data: encodeCb("up", "track", "regular") },
          { text: "Pre-IELTS", callback_data: encodeCb("up", "track", "pre_ielts") },
          { text: "Intro", callback_data: encodeCb("up", "track", "intro") },
        ],
        [cancel],
      ],
    };
  }

  // Everything but the title. The title is free text, so it is the last step.
  await setSession(chatId, "await_title", draft as unknown as Record<string, unknown>);
  return { text: "Finally — send the test title as a message." };
}

/** Last step: the title arrives as plain text, and the test is published. */
export async function publish(
  chatId: number,
  session: Session | null,
  title: string,
): Promise<{ text: string; keyboard?: InlineKeyboard }> {
  const draft = draftOf(session);
  if (!draft) return { text: "That upload has expired. Send the file again." };

  const clean = title.trim().replace(/\s+/g, " ");
  if (!clean) return { text: "A title is required. Send one." };
  if (clean.length > 120) return { text: "That title is too long (max 120 characters)." };

  const db = createAdminClient();
  const { data: owner } = await db
    .from("profiles")
    .select("id")
    .eq("is_owner", true)
    .limit(1)
    .maybeSingle();
  const createdBy = (owner as { id?: string } | null)?.id;
  if (!createdBy) return { text: "No owner account found to attribute the upload to." };

  const created = await createTestFromHtml({
    title: clean,
    skill: draft.skill ?? "reading",
    kind: draft.kind ?? "single",
    tier: draft.tier ?? "free",
    track: draft.track ?? "regular",
    questionTypes: draft.types,
    level: null,
    passage: draft.passage ?? null,
    html: draft.html,
    createdBy,
  });

  // Clear the session either way: on success there is nothing left to do, and
  // on failure the draft holds a whole HTML file that should not linger.
  await clearSession(chatId);

  if (!created.ok) return { text: `❌ ${escapeHtml(created.error)}` };

  const skill = draft.skill ?? "reading";
  return {
    text: clamp(
      [
        "✅ <b>Published</b>",
        "",
        escapeHtml(clean),
        `${skill} · ${draft.kind} · ${draft.tier} · ${draft.track}`,
        `${num(created.total)} questions`,
        draft.needsReview ? "⚠️ <i>Check the question types on /admin/tests.</i>" : "",
      ]
        .filter(Boolean)
        .join("\n"),
    ),
    keyboard: [
      [{ text: "🔗 Open it", url: `${SITE_URL}/${skill}/${created.id}` }],
      [{ text: "‹ Menu", callback_data: encodeCb("menu") }],
    ],
  };
}
