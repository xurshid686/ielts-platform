import Link from "next/link";
import { BookOpen, Headphones } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { avg } from "@/lib/utils";
import { isPremiumActive } from "@/lib/premium";
import { Card } from "@/components/ui/card";
import { TestBrowser, type BrowserItem } from "@/components/sections/test-browser";
import { RecentBandsChart, type RecentBandPoint } from "@/components/sections/recent-bands";
import { PremiumContact } from "@/components/premium-contact";
import type { Result, Test } from "@/types/database";
import { rows } from "@/types/database";

const META = {
  reading: { title: "Reading", icon: BookOpen, blurb: "Academic passages with instant scoring." },
  listening: { title: "Listening", icon: Headphones, blurb: "Audio tests scored as you submit." },
} as const;

export async function SkillSection({ skill }: { skill: "reading" | "listening" }) {
  // Public page: `profile` is null for a logged-out visitor, who still gets the
  // full catalogue. Anything personal (attempts, best band) is simply
  // absent for them.
  const profile = await getProfile();
  const supabase = await createClient();

  // Note: file_url/file_path are intentionally NOT selected — premium content
  // is fetched only via /api/test-html (which gates access).
  const baseCols =
    "id, slug, title, skill, kind, tier, question_types, times_done, total, level, passage, created_at, track";

  // Only the three columns this page actually reads. `select("*")` also pulled
  // `results.answers` — the whole 40-question response map for every attempt —
  // to compute an average and a count.
  type AttemptRow = Pick<Result, "test_id" | "band" | "submitted_at">;

  const [tests, results] = await Promise.all([
    supabase
      .from("tests")
      .select(baseCols)
      .eq("skill", skill)
      .order("created_at", { ascending: false })
      .then((r) => rows<Test>(r.data)),
    profile
      ? supabase
          .from("results")
          .select("test_id, band, submitted_at")
          .eq("user_id", profile.id)
          .eq("skill", skill)
          .order("submitted_at", { ascending: false })
          .then((r) => rows<AttemptRow>(r.data))
      : Promise.resolve(null),
  ]);

  // Only the normal IELTS tests belong on these pages; level-specific tests
  // (pre_ielts / intro) live in their own menus. Missing track = regular.
  const testList = ((tests ?? []) as Test[]).filter((t) => (t.track ?? "regular") === "regular");
  const res = results ?? [];
  const canAccessPremium = !!profile && (profile.role === "admin" || isPremiumActive(profile));

  // Attempts indexed by test, built in ONE pass. This was a `res.filter` per
  // card, i.e. O(tests x attempts) — 185 cards against a student's whole
  // history on every render of this page.
  const byTest = new Map<string, { count: number; best: number | null }>();
  for (const r of res) {
    if (!r.test_id) continue;
    const entry = byTest.get(r.test_id) ?? { count: 0, best: null };
    entry.count++;
    if (r.band != null) {
      const b = Number(r.band);
      entry.best = entry.best == null ? b : Math.max(entry.best, b);
    }
    byTest.set(r.test_id, entry);
  }

  // Enrich each test with the user's attempt count + best band. Newest uploads
  // first so freshly added tests appear at the top.
  const items: BrowserItem[] = [...testList]
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
    .map((t) => {
      const attempts = byTest.get(t.id);
      return {
        id: t.id,
        slug: t.slug,
        title: t.title,
        kind: t.kind ?? "single",
        tier: t.tier ?? "free",
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

  const bands = res.filter((r) => r.band != null).map((r) => Number(r.band));
  const average = avg(bands);
  const best = bands.length ? Math.max(...bands) : null;

  const freeTotal = items.filter((i) => i.tier !== "premium").length;
  const Meta = META[skill];
  const Icon = Meta.icon;
  // Last 12 scored attempts with dates, oldest first (chart order).
  const recent: RecentBandPoint[] = res
    .filter((r) => r.band != null)
    .slice(0, 12)
    .reverse()
    .map((r) => ({ band: Number(r.band), at: r.submitted_at }));

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">{Meta.title}</h1>
          <p className="text-muted">{Meta.blurb}</p>
        </div>
      </div>

      {/* A visitor with no account sees the whole catalogue; this is the only
          thing asking them to sign up, and it says what they get for it rather
          than blocking the page. */}
      {!profile && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/25 bg-primary/5 p-4">
          <p className="text-sm">
            <span className="font-semibold">
              {freeTotal} free {skill} tests, open to everyone.
            </span>{" "}
            <span className="text-muted">
              Create a free account to save your scores, see a full answer review and track your
              band over time.
            </span>
          </p>
          <div className="flex shrink-0 gap-2">
            <Link
              href="/register"
              className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              Create free account
            </Link>
            <Link
              href="/login"
              className="inline-flex h-9 items-center rounded-lg border border-border px-4 text-sm font-medium hover:bg-surface-2"
            >
              Sign in
            </Link>
          </div>
        </div>
      )}

      {/* Stats only once there is something real to show. For a new user these
          read "—", "—", "0" and take the whole first screen, pushing the tests
          they came for below the fold. */}
      {res.length > 0 && (
      <section
        className={recent.length >= 2 ? "grid gap-4 lg:grid-cols-[1fr_1.7fr]" : undefined}
      >
        <div
          className={`grid grid-cols-3 gap-4 ${recent.length >= 2 ? "lg:grid-cols-1" : ""}`}
        >
          <Card className="flex flex-col justify-center">
            <p className="text-sm text-muted">Average band</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{average ?? "—"}</p>
          </Card>
          <Card className="flex flex-col justify-center">
            <p className="text-sm text-muted">Best band</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{best ?? "—"}</p>
          </Card>
          <Card className="flex flex-col justify-center">
            <p className="text-sm text-muted">Tests taken</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{res.length}</p>
          </Card>
        </div>

        <RecentBandsChart
          points={recent}
          color={skill === "reading" ? "var(--primary)" : "var(--accent)"}
          avgColor={skill === "reading" ? "var(--accent)" : "var(--primary)"}
        />
      </section>
      )}

      {/* ONE catalogue — free and premium together, searchable and filterable.
          Premium used to render in a separate block above this one, so the
          first thing a free user saw was a grid of locked cards and the
          reasonable conclusion was that the whole library is paid. Everything
          the viewer can actually start now sorts first. */}
      <TestBrowser
        items={items}
        skill={skill}
        canAccessPremium={canAccessPremium}
        isAdmin={profile?.role === "admin"}
      />

      {!canAccessPremium && <PremiumContact className="mt-2" />}
    </div>
  );
}
