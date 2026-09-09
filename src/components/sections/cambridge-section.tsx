import { BookOpen, Headphones } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { TestBrowser, type BrowserItem } from "@/components/sections/test-browser";
import type { Profile, Result, Test } from "@/types/database";
import { rows } from "@/types/database";

/**
 * The Cambridge catalogue, for a viewer who is allowed to see it.
 *
 * Deliberately NOT `SkillSection` with a track argument. That component carries
 * things this section must not have: `TestIndexLinks`, which exists purely to
 * make every paper crawlable, and the free/premium tier tabs and
 * `PremiumContact`, which describe a different gate from this one. Cambridge
 * papers are all `tier: 'free'` — a paywall on top of the approval gate would be
 * a second lock on the same door.
 *
 * The reads are the CALLER'S client, so RLS still applies; the papers are only
 * here because `track = 'cambridge'` and the viewer is a member.
 */
export async function CambridgeSection({ profile }: { profile: Profile }) {
  const supabase = await createClient();

  const baseCols =
    "id, slug, title, skill, kind, tier, question_types, times_done, total, level, passage, created_at, track";

  type AttemptRow = Pick<Result, "test_id" | "band">;

  const [tests, results] = await Promise.all([
    supabase
      .from("tests")
      .select(baseCols)
      .eq("track", "cambridge")
      .order("created_at", { ascending: false })
      .then((r) => rows<Test>(r.data)),
    supabase
      .from("results")
      .select("test_id, band")
      .eq("user_id", profile.id)
      .then((r) => rows<AttemptRow>(r.data)),
  ]);

  // One pass, indexed by test — the same shape skill-section builds, and for the
  // same reason: a `filter` per card is O(tests x attempts).
  const byTest = new Map<string, { count: number; best: number | null }>();
  for (const r of results) {
    if (!r.test_id) continue;
    const entry = byTest.get(r.test_id) ?? { count: 0, best: null };
    entry.count++;
    if (r.band != null) {
      const b = Number(r.band);
      entry.best = entry.best == null ? b : Math.max(entry.best, b);
    }
    byTest.set(r.test_id, entry);
  }

  const toItems = (skill: "reading" | "listening"): BrowserItem[] =>
    tests
      .filter((t) => t.skill === skill)
      .map((t) => {
        const attempts = byTest.get(t.id);
        return {
          id: t.id,
          slug: t.slug,
          title: t.title,
          kind: t.kind ?? "single",
          tier: "free" as const,
          passage: t.passage,
          level: t.level,
          questionTypes: t.question_types ?? [],
          questionCount: t.total ?? null,
          timesDone: t.times_done ?? 0,
          attempts: attempts?.count ?? 0,
          best: attempts?.best ?? null,
          createdAt: t.created_at,
        };
      });

  const reading = toItems("reading");
  const listening = toItems("listening");

  if (!reading.length && !listening.length) {
    return (
      <p className="rounded-2xl border border-border bg-surface p-5 text-sm text-muted shadow-soft">
        No Cambridge tests have been added yet. They will appear here as soon as they are uploaded.
      </p>
    );
  }

  return (
    <div className="space-y-10">
      {reading.length > 0 && (
        <section>
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
            <BookOpen className="h-4 w-4 text-primary" /> Reading
          </h2>
          <TestBrowser
            items={reading}
            skill="reading"
            canAccessPremium
            isAdmin={profile.role === "admin"}
          />
        </section>
      )}

      {listening.length > 0 && (
        <section>
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
            <Headphones className="h-4 w-4 text-primary" /> Listening
          </h2>
          <TestBrowser
            items={listening}
            skill="listening"
            canAccessPremium
            isAdmin={profile.role === "admin"}
          />
        </section>
      )}
    </div>
  );
}
