import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { SITE_URL } from "@/lib/site";
import { escapeHtml, clamp, num, date } from "../format";
import { encodeCb } from "../callback";
import type { InlineKeyboard } from "../types";

// Browse, rename and delete the test catalogue.

const PAGE = 8;

export async function listTests(
  skill: "reading" | "listening",
  page: number,
): Promise<{ text: string; keyboard: InlineKeyboard }> {
  const db = createAdminClient();
  const from = page * PAGE;

  const { data, count, error } = await db
    .from("tests")
    .select("id, title, kind, tier, track, total, times_done", { count: "exact" })
    .eq("skill", skill)
    .order("created_at", { ascending: false })
    .range(from, from + PAGE - 1);

  if (error) {
    return {
      text: `Could not list tests: ${escapeHtml(error.message)}`,
      keyboard: [[{ text: "‹ Menu", callback_data: encodeCb("menu") }]],
    };
  }

  const rows = (data ?? []) as {
    id: string;
    title: string;
    kind: string;
    tier: string;
    total: number;
    times_done: number;
  }[];

  const total = count ?? 0;
  const lastPage = Math.max(0, Math.ceil(total / PAGE) - 1);

  const keyboard: InlineKeyboard = rows.map((t) => [
    {
      text: `${t.tier === "premium" ? "👑 " : ""}${t.title}`.slice(0, 60),
      callback_data: encodeCb("test", t.id),
    },
  ]);

  const nav = [];
  if (page > 0) nav.push({ text: "‹ Prev", callback_data: encodeCb("tp", skill, String(page - 1)) });
  if (page < lastPage)
    nav.push({ text: "Next ›", callback_data: encodeCb("tp", skill, String(page + 1)) });
  if (nav.length) keyboard.push(nav);

  keyboard.push([
    { text: "📖 Reading", callback_data: encodeCb("tp", "reading", "0") },
    { text: "🎧 Listening", callback_data: encodeCb("tp", "listening", "0") },
  ]);
  keyboard.push([{ text: "‹ Menu", callback_data: encodeCb("menu") }]);

  const text =
    total === 0
      ? `No ${skill} tests yet.`
      : `🧪 <b>${skill === "reading" ? "Reading" : "Listening"}</b> — ${num(total)} tests` +
        `\nPage ${page + 1} of ${lastPage + 1}`;

  return { text: clamp(text), keyboard };
}

export async function buildTestCard(
  id: string,
): Promise<{ text: string; keyboard: InlineKeyboard } | null> {
  const db = createAdminClient();

  const { data } = await db
    .from("tests")
    .select("id, slug, title, skill, kind, tier, track, level, passage, total, times_done, question_types, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;

  const t = data as {
    id: string;
    slug: string | null;
    title: string;
    skill: string;
    kind: string;
    tier: string;
    track: string;
    passage: number | null;
    total: number;
    times_done: number;
    question_types: string[] | null;
    created_at: string | null;
  };

  const { count: attempts } = await db
    .from("results")
    .select("id", { count: "exact", head: true })
    .eq("test_id", id);

  const lines = [
    `🧪 <b>${escapeHtml(t.title)}</b>`,
    [
      t.skill,
      t.kind,
      t.passage ? `passage ${t.passage}` : null,
      t.tier,
      t.track,
    ]
      .filter(Boolean)
      .join(" · "),
    `${num(t.total)} questions · ${num(attempts ?? 0)} attempts`,
    `Uploaded ${date(t.created_at)}`,
  ];

  if (t.question_types?.length) {
    lines.push("", `<i>${escapeHtml(t.question_types.join(", "))}</i>`);
  }

  const keyboard: InlineKeyboard = [
    [
      { text: "✏️ Rename", callback_data: encodeCb("tren", t.id) },
      { text: "🗑 Delete", callback_data: encodeCb("tdel", t.id) },
    ],
    [{ text: "🔗 Open on the site", url: `${SITE_URL}/${t.skill}/${t.slug || t.id}` }],
    [
      { text: "‹ Back", callback_data: encodeCb("tp", t.skill, "0") },
      { text: "‹ Menu", callback_data: encodeCb("menu") },
    ],
  ];

  return { text: clamp(lines.join("\n")), keyboard };
}

/**
 * The two-tap guard.
 *
 * Deleting a test destroys the only copy of an uploaded paper, and on a phone a
 * mis-tap is one thumb-width away. The confirmation names the test so the
 * second tap is an informed one.
 */
export async function confirmDelete(
  id: string,
): Promise<{ text: string; keyboard: InlineKeyboard } | null> {
  const db = createAdminClient();
  const { data } = await db.from("tests").select("title, skill").eq("id", id).maybeSingle();
  if (!data) return null;
  const t = data as { title: string; skill: string };

  const { count } = await db
    .from("results")
    .select("id", { count: "exact", head: true })
    .eq("test_id", id);

  return {
    text: clamp(
      [
        `⚠️ <b>Delete this test?</b>`,
        "",
        escapeHtml(t.title),
        `${num(count ?? 0)} student attempts reference it.`,
        "",
        "<i>The HTML file is deleted too, and it exists nowhere else.</i>",
      ].join("\n"),
    ),
    keyboard: [
      [
        { text: "⚠️ Yes, delete", callback_data: encodeCb("tdel2", id) },
        { text: "Cancel", callback_data: encodeCb("test", id) },
      ],
    ],
  };
}

export async function deleteTest(id: string): Promise<{ ok: boolean; note: string }> {
  const db = createAdminClient();

  const { data } = await db.from("tests").select("file_path, skill, title").eq("id", id).maybeSingle();
  const t = data as { file_path?: string; skill?: string; title?: string } | null;
  if (!t) return { ok: false, note: "That test no longer exists." };

  // Order matters, and it is the same order deleteTest() uses in
  // app/actions/admin.ts. Removing the storage object first loses the paper
  // outright if the row delete then fails; deleting the row first means the
  // worst case is an orphaned object, which costs storage and nothing else.
  const { error } = await db.from("tests").delete().eq("id", id);
  if (error) return { ok: false, note: error.message };

  if (t.file_path) {
    const { error: rmErr } = await db.storage.from("tests").remove([t.file_path]);
    if (rmErr) {
      console.error(`[telegram] test ${id} deleted, storage object left behind: ${rmErr.message}`);
    }
  }

  return { ok: true, note: `Deleted "${t.title ?? id}".` };
}

export async function renameTest(id: string, title: string): Promise<{ ok: boolean; note: string }> {
  const db = createAdminClient();

  const next = title.trim().replace(/\s+/g, " ");
  if (!next) return { ok: false, note: "A title is required." };
  if (next.length > 120) return { ok: false, note: "Title is too long (max 120 characters)." };

  const { data } = await db.from("tests").select("skill, title").eq("id", id).maybeSingle();
  const t = data as { skill?: string; title?: string } | null;
  if (!t) return { ok: false, note: "That test no longer exists." };
  if (t.title === next) return { ok: true, note: "Title unchanged." };

  // Two tests of the same skill must never share a title: the bulk upload
  // scripts delete by title before inserting, so a duplicate means the next
  // re-upload quietly removes the wrong row.
  const { data: clash } = await db
    .from("tests")
    .select("id")
    .eq("skill", t.skill ?? "")
    .eq("title", next)
    .neq("id", id)
    .limit(1);
  if (Array.isArray(clash) && clash.length > 0) {
    return { ok: false, note: `Another ${t.skill} test is already called "${next}".` };
  }

  // Renamed IN PLACE, keeping the id: `results.test_id` is the link to every
  // student's attempt history, and a delete-and-reupload would strip it.
  const { error } = await db.from("tests").update({ title: next }).eq("id", id);
  if (error) return { ok: false, note: error.message };

  return { ok: true, note: `Renamed to "${next}".` };
}
