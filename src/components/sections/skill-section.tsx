import Link from "next/link";
import { BookOpen, Headphones, ArrowRight, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { avg } from "@/lib/utils";
import { Card } from "@/components/ui/card";
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

  let testList = (tests ?? []) as Test[];
  if (skill === "reading") {
    // Group by passage (1,2,3) with un-tagged tests last, newest first within a group.
    testList = [...testList].sort(
      (a, b) => (a.passage ?? 99) - (b.passage ?? 99),
    );
  }
  const res = (results ?? []) as Result[];
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

      {/* Test list */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Available tests</h2>
        {testList.length === 0 ? (
          <Card className="text-center text-muted">
            No {skill} tests have been uploaded yet.
            {profile.role === "admin" && (
              <>
                {" "}
                <Link href="/admin/tests" className="font-medium text-primary hover:underline">
                  Upload one →
                </Link>
              </>
            )}
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {testList.map((t) => {
              const attempts = res.filter((r) => r.test_id === t.id);
              const bestAttempt = attempts.length
                ? Math.max(...attempts.filter((a) => a.band != null).map((a) => Number(a.band)))
                : null;
              return (
                <Link key={t.id} href={`/${skill}/${t.id}`}>
                  <Card className="h-full transition-colors hover:border-primary/50">
                    <div className="flex items-start justify-between">
                      <FileText className="h-5 w-5 text-primary" />
                      <div className="flex items-center gap-1.5">
                        {t.passage && (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                            Passage {t.passage}
                          </span>
                        )}
                        {t.level && (
                          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">
                            {t.level}
                          </span>
                        )}
                      </div>
                    </div>
                    <h3 className="mt-3 font-semibold leading-snug">{t.title}</h3>
                    <div className="mt-3 flex items-center justify-between text-sm text-muted">
                      <span>
                        {attempts.length
                          ? `${attempts.length} attempt${attempts.length > 1 ? "s" : ""}${
                              bestAttempt != null ? ` · best ${bestAttempt}` : ""
                            }`
                          : "Not attempted"}
                      </span>
                      <ArrowRight className="h-4 w-4" />
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
