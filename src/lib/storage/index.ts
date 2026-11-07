import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { r2Bucket } from "./r2";

/**
 * The one door to file storage. Every bucket call in the app goes through
 * `fileStore(bucket, client)`, which answers with the same shapes supabase-js's
 * `storage.from(bucket)` does, so a call site changes by one line and its error
 * handling stays as it was.
 *
 * Why it exists (2026-11-07): Supabase restricted the live project for
 * `exceed_cached_egress_quota` — file downloads, chiefly the 5.6 MB intro video
 * on every test open. Cloudflare R2 charges nothing for egress, so the files
 * move there and Supabase keeps only auth and data.
 *
 * `STORAGE_BACKEND=r2` switches every bucket at once; anything else (or unset)
 * keeps Supabase. The switch is an env change, not a deploy, so a rollback is
 * the same env change back. Object keys are identical on both sides — R2 holds
 * `<bucket>/<path>` in one private bucket — so no `file_path` in the database
 * ever changes.
 *
 * ACCESS CONTROL: Supabase Storage applied RLS to the user-scoped client; R2
 * applies none. Every caller already builds or reads its paths server-side
 * (speaking: `${user.id}/…` from the session; signed reads: paths from rows
 * the user's own RLS returned), so nothing relied on storage RLS — keep it so.
 */

export type StorageError = { message: string };

export type FileStore = {
  upload(
    path: string,
    body: Blob | ArrayBuffer | Uint8Array | Buffer,
    opts?: { contentType?: string; upsert?: boolean },
  ): Promise<{ error: StorageError | null }>;
  download(path: string): Promise<{ data: Blob | null; error: StorageError | null }>;
  remove(paths: string[]): Promise<{ error: StorageError | null }>;
  list(prefix: string): Promise<{ data: { name: string }[] | null; error: StorageError | null }>;
  createSignedUrl(
    path: string,
    expiresIn: number,
  ): Promise<{ data: { signedUrl: string } | null; error: StorageError | null }>;
  createSignedUrls(
    paths: string[],
    expiresIn: number,
  ): Promise<{
    data: { path: string | null; signedUrl: string; error: string | null }[] | null;
    error: StorageError | null;
  }>;
};

export function storageBackend(): "supabase" | "r2" {
  return process.env.STORAGE_BACKEND === "r2" ? "r2" : "supabase";
}

/**
 * `client` is only used on the Supabase backend — pass the same client the call
 * site used before (service-role or user-scoped), so that path is unchanged.
 */
export function fileStore(
  bucket: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any Database generic
  client: SupabaseClient<any, any, any>,
): FileStore {
  if (storageBackend() === "r2") return r2Bucket(bucket);
  return client.storage.from(bucket) as unknown as FileStore;
}
