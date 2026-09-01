"use client";

import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Shared body for the App Router error boundaries.
 *
 * There were none at all: any transient Supabase failure inside a server
 * component — and every page here reads Supabase — surfaced as Next's raw
 * error screen with a digest hash and no way back.
 *
 * `reset()` re-runs the failed segment, which is the right first action for
 * the failure this actually catches: a dropped connection or a timeout.
 */
export function ErrorState({
  reset,
  digest,
  title = "Something went wrong",
  message = "This page couldn't load. It's usually temporary — try again.",
  homeHref = "/",
}: {
  reset: () => void;
  digest?: string;
  title?: string;
  message?: string;
  homeHref?: string;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-danger/10 text-danger">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <h1 className="mt-5 text-xl font-bold text-foreground">{title}</h1>
      <p className="mt-2 max-w-sm text-sm text-muted">{message}</p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Button onClick={reset}>Try again</Button>
        <Button variant="outline" asChild>
          <Link href={homeHref}>Go back</Link>
        </Button>
      </div>

      {/* The digest is the only handle on the server-side log for this error,
          so it belongs on screen — a student can quote it in a support message. */}
      {digest ? (
        <p className="mt-6 font-mono text-xs text-muted">Reference: {digest}</p>
      ) : null}
    </div>
  );
}
