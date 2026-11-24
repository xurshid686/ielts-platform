import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { fileStore } from "@/lib/storage";

/**
 * Uploaded profile photos (owner, 2026-11-24). One object per account,
 * `avatars/<userId>.img` (WebP, or JPEG from Safari), written by the server only. `profiles.avatar_url`
 * holds `/api/avatar/<userId>?v=<stamp>`, so every existing <img src={avatar_url}>
 * (header, menu, leaderboard, podium, /u/[id]) works unchanged; the stamp
 * changes on each upload, which is what lets the route cache forever.
 */
export const AVATAR_BUCKET = "avatars";
export const AVATAR_MAX_BYTES = 300 * 1024;

export const avatarPath = (userId: string) => `${userId}.img`;
export const avatarUrl = (userId: string) => `/api/avatar/${userId}?v=${Date.now().toString(36)}`;

export function avatarStore() {
  return fileStore(AVATAR_BUCKET, createAdminClient());
}

/** Delete the stored photo and clear avatar_url (also clears a Google photo). */
export async function clearAvatar(userId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  await avatarStore().remove([avatarPath(userId)]); // an absent object is fine
  const { error } = await createAdminClient().from("profiles").update({ avatar_url: null }).eq("id", userId);
  return error ? { ok: false, error: error.message } : { ok: true };
}
