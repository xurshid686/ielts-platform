import { BookOpen, Headphones } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { avg } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { TestBrowser, type BrowserItem } from "@/components/sections/test-browser";
import type { Result, Test } from "@/types/database";

const META = {
  reading: { title: "Reading", icon: BookOpen, blurb: "Academic passages with instant scoring." },
  listening: { title: "Listening", icon: Headphones, blurb: "Audio tests scored as you submit." },
} as const;

export async function SkillSection({ skill }: { skill: "reading" | "listening" }) {
  const profile = await requireProfile();
  const supabase = await createClient();

  const [{ data: tests }, { data: results }] = await Promise.all([
    supabase.from("tests").select("*").eq("skill", skill).order("created_at", { ascending: false }),
    supabase
      .from("results")
      .select("*")
      .eq("user_id", profile.id)
      .eq("skill", skill)
      .order("submitted_at", { ascending: false }),
  ]);

  const testList = (tests ?? []) as Test[];
  const res = (results ?? []) as Result[];

  // Enrich each test with the user's attempt count + best band, then order
  // full tests first, then passages by number.
  const items: BrowserItem[] = [...testList]
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "full" ? -1 : 1;
      return (a.passage ?? 99) - (b.passage ?? 99);
    })
    .map((t) => {
      const attempts = res.filter((r) => r.test_id === t.id);
      const bandAttempts = attempts.filter((a) => a.band != null).map((a) => Number(a.band));
      return {
        id: t.id,
        title: t.title,
        kind: t.kind ?? "single",
        passage: t.passage,
        level: t.level,
        attempts: attempts.length,
        best: bandAttempts.length ? Math.max(...bandAttempts) : null,
        createdAt: t.created_at,
      };
    });

  const bands = res.filter((r) => r.band != null).map((r) => Number(r.band));
  const average = avg(bands);
  const best = bands.length ? Math.max(...bands) : null;

  const Meta = META[skill];
  const Icon = Meta.icon;
  const recent = [...bands].slice(0, 12).reverse();

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

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <p className="text-sm text-muted">Average band</p>
          <p className="mt-1 text-2xl font-bold">{average ?? "—"}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted">Best band</p>
          <p className="mt-1 text-2xl font-bold">{best ?? "—"}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted">Tests taken</p>
          <p className="mt-1 text-2xl font-bold">{res.length}</p>
        </Card>
      </div>

      {/* Progress graph */}
      {recent.length > 1 && (
        <Card>
          <p className="mb-3 text-sm font-medium text-muted">Recent bands</p>
          <div className="flex h-28 items-end gap-2">
            {recent.map((b, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t bg-primary/70"
                  style={{ height: `${(b / 9) * 100}%` }}
                  title={`Band ${b}`}
                />
                <span className="text-[10px] text-muted">{b}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Test list with search + filter */}
      <TestBrowser items={items} skill={skill} />
    </div>
  );
}
