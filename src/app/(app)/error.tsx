"use client";

import { ErrorState } from "@/components/error-state";

// Boundary for the signed-in app. It renders INSIDE the (app) layout, so the
// shell, nav and theme survive the failure and the student is never dropped
// onto a bare error page with no way back into the site.
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorState
      reset={reset}
      digest={error.digest}
      message="This page couldn't load. It's usually temporary — try again, or head back to your dashboard."
      homeHref="/dashboard"
    />
  );
}
