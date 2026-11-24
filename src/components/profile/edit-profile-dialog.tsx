"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, Trash2, UserPen, X } from "lucide-react";
import { PremiumRing } from "@/components/premium-ring";
import { cleanNamePart, splitName } from "@/lib/profile-name";
import { removeMyAvatar, updateName, uploadAvatar } from "@/app/actions/profile";

const SIZE = 256; // stored avatar is SIZE x SIZE
const MAX_INPUT_BYTES = 8 * 1024 * 1024;

/**
 * Crop the picture to a centred square and shrink it to SIZE px, in the
 * browser, so the server only ever stores a ~20 KB image. WebP where the
 * canvas can encode it; Safari cannot, and gets JPEG.
 */
async function squarePhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    SIZE,
    SIZE,
  );
  bitmap.close();
  const encode = (type: string) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85));
  const webp = await encode("image/webp");
  if (webp && webp.type === "image/webp") return webp;
  const jpeg = await encode("image/jpeg");
  if (!jpeg) throw new Error("encode failed");
  return jpeg;
}

export function EditProfileDialog({
  name,
  avatarUrl,
  premium,
  onClose,
}: {
  name: string | null;
  avatarUrl: string | null;
  premium: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const initialName = splitName(name);
  const [first, setFirst] = useState(initialName.first);
  const [last, setLast] = useState(initialName.last);
  const [photo, setPhoto] = useState<string | null>(avatarUrl);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const [photoBusy, startPhoto] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const busy = saving || photoBusy;

  const initial = (first || name || "?").charAt(0).toUpperCase();

  function pickPhoto(file: File | undefined) {
    if (!file) return;
    setError(null);
    setNotice(null);
    if (!file.type.startsWith("image/")) {
      setError("Choose a picture (JPG, PNG or WebP).");
      return;
    }
    if (file.size > MAX_INPUT_BYTES) {
      setError("That picture is over 8 MB. Choose a smaller one.");
      return;
    }
    startPhoto(async () => {
      let blob: Blob;
      try {
        blob = await squarePhoto(file);
      } catch {
        setError("We couldn't read that picture. Try a JPG or PNG.");
        return;
      }
      const form = new FormData();
      form.append("photo", blob, "avatar");
      const res = await uploadAvatar(form);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setPhoto(res.avatarUrl ?? null);
      setNotice("Photo updated.");
      router.refresh();
    });
  }

  function removePhoto() {
    setError(null);
    setNotice(null);
    startPhoto(async () => {
      const res = await removeMyAvatar();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setPhoto(null);
      setNotice("Photo removed.");
      router.refresh();
    });
  }

  function save() {
    setNotice(null);
    // Quick feedback here; the server re-checks with the same rules.
    const f = cleanNamePart(first, "First name");
    if (!f.ok) return setError(f.error);
    const l = cleanNamePart(last, "Surname");
    if (!l.ok) return setError(l.error);
    setError(null);
    startSave(async () => {
      const res = await updateName(first, last);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-profile-title"
        className="relative w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-elevated"
      >
        <button
          onClick={() => !busy && onClose()}
          className="absolute right-3 top-3 text-muted hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
        <h3 id="edit-profile-title" className="flex items-center gap-2 font-semibold">
          <UserPen className="h-5 w-5 text-primary" /> Edit profile
        </h3>

        {/* Photo */}
        <div className="mt-5 flex items-center gap-4">
          <PremiumRing on={premium} crown="md">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photo}
                alt="Your profile photo"
                className="h-16 w-16 rounded-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/15 text-xl font-semibold text-primary">
                {initial}
              </span>
            )}
          </PremiumRing>
          <div className="flex flex-col items-start gap-1.5">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-2 disabled:opacity-60"
            >
              {photoBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              {photo ? "Change photo" : "Upload photo"}
            </button>
            {photo && (
              <button
                type="button"
                onClick={removePhoto}
                disabled={busy}
                className="inline-flex items-center gap-1.5 px-1 text-xs font-medium text-muted hover:text-danger disabled:opacity-60"
              >
                <Trash2 className="h-3.5 w-3.5" /> Remove photo
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                pickPhoto(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>
        </div>
        <p className="mt-2 text-xs text-muted">
          Shown on the leaderboard and your public profile. We crop it to a square.
        </p>

        {/* Name */}
        <label htmlFor="edit-first" className="mt-5 block text-sm font-medium">
          First name
        </label>
        <input
          id="edit-first"
          value={first}
          onChange={(e) => setFirst(e.target.value)}
          maxLength={30}
          autoComplete="given-name"
          disabled={busy}
          className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <label htmlFor="edit-last" className="mt-3 block text-sm font-medium">
          Surname
        </label>
        <input
          id="edit-last"
          value={last}
          onChange={(e) => setLast(e.target.value)}
          maxLength={30}
          autoComplete="family-name"
          disabled={busy}
          className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />

        {error && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        )}
        {notice && !error && <p className="mt-3 text-sm text-success">{notice}</p>}

        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-2 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={busy}
            className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
