import Link from "next/link";
import { Users, FileText, CheckCircle2, Flame, ArrowRight, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { timeAgo } from "@/lib/utils";
import type { Profile } from "@/types/database";

export default async function AdminPage() {
  const supabase = await createClient();

  const [{ data: students }, { count: testCount }, { count: resultCount }] = await Promise.all([
    supabase.from("profiles").select("*").order("created_at", { ascending: false }),
    supabase.from("tests").select("*", { count: "exact", head: true }),
    supabase.from("results").select("*", { count: "exact", head: true }),
  ]);

  const people = (students ?? []) as Profile[];
  const activeStreaks = people.filter((p) => p.streak > 0).length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Admin overview</h1>
        <p className="text-muted">Platform content, students, and activity at a glance.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat icon={<Users className="text-primary" />} label="Students" value={people.length} />
        <Stat icon={<FileText className="text-primary" />} label="Tests" value={testCount ?? 0} />
        <Stat icon={<CheckCircle2 className="text-success" />} label="Results" value={resultCount ?? 0} />
        <Stat icon={<Flame className="text-warning" />} label="Active streaks" value={activeStreaks} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="flex items-center justify-between">
          <div>
            <h2 className="flex items-center gap-2 font-semibold">
              <FileText className="h-4 w-4 text-primary" /> Manage tests
            </h2>
            <p className="text-sm text-muted">Upload and remove reading/listening tests.</p>
          </div>
          <Link
            href="/admin/tests"
            className="inline-flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-[var(--shadow-primary)]"
          >
            Open <ArrowRight className="h-4 w-4" />
          </Link>
        </Card>
        <Card className="flex items-center justify-between">
          <div>
            <h2 className="flex items-center gap-2 font-semibold">
              <ShieldCheck className="h-4 w-4 text-primary" /> Manage admins
            </h2>
            <p className="text-sm text-muted">Promote or revoke admins by email.</p>
          </div>
          <Link
            href="/admin/team"
            className="inline-flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-[var(--shadow-primary)]"
          >
            Open <ArrowRight className="h-4 w-4" />
          </Link>
        </Card>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Students</h2>
        <Card className="p-0">
          <ul className="divide-y divide-border">
            {people.map((p) => (
              <li key={p.id} className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
                    {(p.name || p.email || "U").charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      {p.name}
                      {p.role === "admin" && (
                        <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
                          admin
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted">{p.email}</p>
                  </div>
                </div>
                <div className="text-right text-sm">
                  <p className="font-medium">
                    {p.streak}🔥 · {p.xp} XP
                  </p>
                  <p className="text-xs text-muted">joined {timeAgo(p.created_at)}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </section>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card>
      <div className="flex items-center gap-2 text-muted">
        <span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span>
        <span className="text-sm">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </Card>
  );
}
