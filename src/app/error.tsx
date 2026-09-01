"use client";

import { ErrorState } from "@/components/error-state";

// Route-level boundary for everything outside the (app) group — the landing
// page, the legal pages and the auth screens.
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorState reset={reset} digest={error.digest} />;
}
