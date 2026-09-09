"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock, X, Loader2, Clock, BookOpen, Headphones } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requestCambridgeAccess } from "@/app/actions/cambridge";
import { MAX_REQUEST_MESSAGE } from "@/lib/cambridge-shared";
import { cn } from "@/lib/utils";

/**
 * What a visitor sees when they are not (yet) approved for the Cambridge
 * section.
 *
 * THE PLACEHOLDERS ARE NOT REAL TESTS. The cards below are generated from a
 * COUNT — "Cambridge Reading Test 1..N" — and the real titles never leave the
 * server for an unapproved viewer. Blurring real titles with CSS would look
 * identical and be worthless: the text would still be in the HTML, in the RSC
 * payload, in view-source and in anything that crawls the page. The blur here
 * is decoration over decoy content, which is the only kind that is safe for
 * copyrighted material.
 */
export type RequestState = "none" | "pending" | "rejected";

export function CambridgeLocked({
  counts,
  signedIn,
  state,
}: {
  counts: { reading: number; listening: number };
  signedIn: boolean;
  state: RequestState;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<RequestState>(state);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-primary/25 bg-primary/5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex gap-3">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Lock className="h-5 w-5" />
            </div>
            <div className="max-w-xl">
              <h2 className="font-semibold">These tests are shared with approved students only</h2>
              <p className="mt-1 text-sm text-muted">
                The Cambridge papers are published books, so they are not open to everyone the way
                the rest of the library is. Send a request and you will be let in once it is
                approved.
              </p>
            </div>
          </div>

          <div className="shrink-0">
            {status === "pending" ? (
              <p className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted">
                <Clock className="h-4 w-4" /> Waiting for approval
              </p>
            ) : signedIn ? (
              <Button onClick={() => setOpen(true)}>
                {status === "rejected" ? "Ask again" : "Request access"}
              </Button>
            ) : (
              <Button asChild>
                <Link href="/login?next=/cambridge">Sign in to request</Link>
              </Button>
            )}
          </div>
        </div>

        {status === "rejected" && (
          <p className="mt-3 text-sm text-muted">
            Your last request was not approved. You can send another one.
          </p>
        )}
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      </div>

      <LockedGrid skill="reading" count={counts.reading} />
      <LockedGrid skill="listening" count={counts.listening} />

      {open && (
        <RequestModal
          onClose={() => setOpen(false)}
          onDone={(next, err) => {
            setStatus(next);
            setError(err);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

function LockedGrid({ skill, count }: { skill: "reading" | "listening"; count: number }) {
  if (count === 0) return null;
  const Icon = skill === "reading" ? BookOpen : Headphones;
  const label = skill === "reading" ? "Reading" : "Listening";

  return (
    <section>
      <h3 className="mb-3 flex items-center gap-2 font-semibold">
        <Icon className="h-4 w-4 text-primary" /> {label}
        <span className="text-sm font-normal text-muted">
          ({count} {count === 1 ? "test" : "tests"})
        </span>
      </h3>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: count }, (_, i) => (
          <div
            key={i}
            aria-hidden
            className="relative overflow-hidden rounded-2xl border border-border bg-surface p-5 shadow-soft"
          >
            {/* Decoy content, blurred. Nothing here came from the database. */}
            <div className="pointer-events-none select-none blur-[5px]">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" />
                </div>
                <p className="font-semibold">
                  Cambridge {label} Test {i + 1}
                </p>
              </div>
              <p className="mt-3 text-sm text-muted">40 questions · full test</p>
              <p className="mt-1 text-sm text-muted">Academic · answers and explanations</p>
            </div>

            <div className="absolute inset-0 flex items-center justify-center">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface/90 text-muted shadow-soft">
                <Lock className="h-4 w-4" />
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * The request form. Hand-rolled overlay in the house style (there is no dialog
 * library here) — same shape as premium-welcome.tsx.
 */
function RequestModal({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: (state: RequestState, error: string | null) => void;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    startTransition(async () => {
      const res = await requestCambridgeAccess(message);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onDone("pending", null);
      router.refresh();
    });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="relative w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-elevated">
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        <h2 className="pr-6 font-semibold">Request Cambridge access</h2>
        <p className="mt-1 text-sm text-muted">
          Tell me who you are or which class you are in, so I can recognise you. Optional.
        </p>

        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, MAX_REQUEST_MESSAGE))}
          rows={4}
          placeholder="e.g. I'm in the Monday 6pm group"
          className="mt-3 w-full resize-none rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <p className="mt-1 text-right text-xs text-muted tabular-nums">
          {message.length}/{MAX_REQUEST_MESSAGE}
        </p>

        {error && <p className="mt-2 text-sm text-danger">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            <span className={cn("flex items-center gap-2")}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Send request
            </span>
          </Button>
        </div>
      </div>
    </div>
  );
}
