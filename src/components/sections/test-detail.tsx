import Link from "next/link";
import { notFound } from "next/navigation";
import { Crown, ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { canAccessTest } from "@/lib/premium";
import { canAccessTrack } from "@/lib/levels";
import { TestRunner } from "@/components/test-runner";
import { PremiumContact } from "@/components/premium-contact";
import { GuestTestLauncher } from "@/components/sections/guest-test-launcher";
import { testJsonLd } from "@/lib/seo";
import type { Test } from "@/types/database";

export async function TestDetail({
  skill,
  id,
}: {
  skill: "reading" | "listening";
  id: string;
}) {
  // Public page: null for a logged-out visitor. They get the test's detail and
  // a sign-in prompt rather than a redirect, so a shared link is worth clicking.
  const profile = await getProfile();
  const supabase = await createClient();

  // Explicit column list — `select("*")` would ask for `answer_key`, which is
  // revoked from the `authenticated` role (migration 0034) precisely so the key
  // can never reach a page that renders for a student.
  const { data: test } = await supabase
    .from("tests")
    .select(
      "id, title, skill, kind, tier, question_types, times_done, difficulty, level, track, passage, total, created_by, created_at",
    )
    .eq("id", id)
    .eq("skill", skill)
    .single();

  if (!test) notFound();
  const t = test as unknown as Test;

  // Level gate: a Pre-IELTS / Intro test is only openable by students of that
  // level (admins pass). Guests only ever see regular-track material.
  const viewer = profile ?? { role: "student", level: "regular", premium_until: null };
  if (!canAccessTrack(viewer, t.track)) notFound();

  // A signed-out visitor may TAKE a free test — proving the product beats any
  // amount of marketing copy. Their attempt is graded server-side but not
  // saved, and the result screen asks them to register. Premium stays gated.
  // A logged-out visitor now always lands on the described page first — free or
  // premium. For a free test it carries a "Start test" button that mounts the
  // runner in place, so guests keep their unauthenticated free attempt; for a
  // premium one it carries the sign-in links it always did.
  //
  // Returning TestRunner directly here used to mean a search engine saw 17
  // words and no <h1> on every free test page, because the runner is a
  // full-screen overlay around an entitlement-gated iframe.
  if (!profile) return <GuestTestGate skill={skill} test={t} />;

  // Premium tests are locked unless subscriber/admin.
  if (!canAccessTest(profile, t)) {
    return (
      <div className="mx-auto max-w-md py-12 text-center">
        <Link
          href={`/${skill}`}
          className="mb-8 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to {skill}
        </Link>
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-8 shadow-soft">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-r from-amber-400 to-yellow-500 text-white">
            <Crown className="h-7 w-7" />
          </div>
          <h1 className="mt-4 text-xl font-bold">This is a Premium test</h1>
          <p className="mt-2 text-sm text-muted">
            This{" "}
            <strong>
              {t.kind === "full"
                ? "full test"
                : skill === "reading"
                  ? t.passage
                    ? `Passage ${t.passage}`
                    : "passage"
                  : "section"}
            </strong>{" "}
            is included with Premium, along with every other test in the library.
          </p>
        </div>
        <PremiumContact className="mt-4 text-left" />
      </div>
    );
  }

  // Server-graded tests have a stored answer key — the manual score-entry
  // fallback is hidden for them (their score can't be hand-entered). `total` is
  // written alongside the key at upload, so it stands in for it here: the key
  // itself is no longer selectable from a page that renders for a student.
  const graded = (t.total ?? 0) > 0;

  return (
    <TestRunner testId={t.id} title={t.title} skill={skill} graded={graded} />
  );
}

/**
 * What a logged-out visitor sees on a test page: the test itself described in
 * full — title, format, question count, question types — and one clear action.
 * The point is that a link shared in Telegram lands on something worth reading
 * rather than on a login form.
 */
function GuestTestGate({ skill, test }: { skill: "reading" | "listening"; test: Test }) {
  const format =
    test.kind === "full"
      ? "Full test"
      : skill === "reading"
        ? test.passage
          ? `Passage ${test.passage}`
          : "Single passage"
        : "Section";
  const next = `/${skill}/${test.id}`;
  const isFree = test.tier !== "premium";

  return (
    <div className="mx-auto max-w-lg py-10">
      {/* Structured data: what produces a rich result for practice-test
          queries. Built from the same row the page renders, so it can never
          describe something different from what the visitor sees. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(testJsonLd({ ...test, skill })) }}
      />
      <Link
        href={`/${skill}`}
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to {skill}
      </Link>

      <div className="rounded-2xl border border-border bg-surface p-6 shadow-soft">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
            {format}
          </span>
          {test.total ? (
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-muted tabular-nums">
              {test.total} questions
            </span>
          ) : null}
          {test.tier === "premium" ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 font-semibold text-warning">
              <Crown className="h-3 w-3" /> Premium
            </span>
          ) : (
            <span className="rounded-full bg-success/15 px-2 py-0.5 font-semibold text-success">
              Free
            </span>
          )}
        </div>

        <h1 className="mt-3 text-2xl font-bold leading-snug">{test.title}</h1>

        {test.question_types?.length ? (
          <p className="mt-2 text-sm text-muted">{test.question_types.join(" · ")}</p>
        ) : null}

        <p className="mt-4 text-sm text-muted">
          This test runs in the real computer-delivered exam interface, and is marked
          automatically the moment you submit — with a band score and a question-by-question
          review of what you got wrong.
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          {isFree ? (
            <>
              <GuestTestLauncher
                testId={test.id}
                title={test.title}
                skill={skill}
                graded={(test.total ?? 0) > 0}
              />
              <Link
                href={`/register?next=${encodeURIComponent(next)}`}
                className="inline-flex h-10 items-center rounded-lg border border-border px-5 text-sm font-medium hover:bg-surface-2"
              >
                Create a free account
              </Link>
            </>
          ) : (
            <>
              <Link
                href={`/register?next=${encodeURIComponent(next)}`}
                className="inline-flex h-10 items-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                Create a free account to start
              </Link>
              <Link
                href={`/login?next=${encodeURIComponent(next)}`}
                className="inline-flex h-10 items-center rounded-lg border border-border px-5 text-sm font-medium hover:bg-surface-2"
              >
                Sign in
              </Link>
            </>
          )}
        </div>
        <p className="mt-3 text-xs text-muted">
          {isFree
            ? "No account needed to try it. Create one to save your score and track your band over time."
            : "It takes a moment, and your scores are saved so you can track your band over time."}
        </p>
      </div>
    </div>
  );
}
