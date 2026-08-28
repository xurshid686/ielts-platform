"use client";

import { useState } from "react";
import { TestRunner } from "@/components/test-runner";

/**
 * "Start test" for a logged-out visitor on a FREE test.
 *
 * Guests have always been able to sit a free test without an account — that is
 * what proves the product — and this preserves it exactly: the attempt is still
 * graded by /api/guest-grade and still persists nothing.
 *
 * What changes is that they land on a readable page first instead of being
 * dropped straight into a full-screen iframe. That page is the only thing a
 * search engine can index: before this, Googlebot got 17 words and no <h1> on
 * every test page, because TestRunner is a `fixed inset-0` overlay and the
 * passage lives inside an entitlement-gated iframe.
 *
 * TestRunner renders as that same fixed overlay, so mounting it from here
 * covers the page exactly as it did when it was returned directly.
 */
export function GuestTestLauncher({
  testId,
  title,
  skill,
  graded,
}: {
  testId: string;
  title: string;
  skill: "reading" | "listening";
  graded: boolean;
}) {
  const [started, setStarted] = useState(false);

  if (started) {
    return <TestRunner testId={testId} title={title} skill={skill} graded={graded} guest />;
  }

  return (
    <button
      type="button"
      onClick={() => setStarted(true)}
      className="inline-flex h-10 items-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground hover:opacity-90"
    >
      Start test
    </button>
  );
}
