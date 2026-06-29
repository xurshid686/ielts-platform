import Link from "next/link";
import { Star, Flame, Zap, Trophy } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { FeedbackComposer } from "@/components/feedback/feedback-composer";
import type { MyStudentLeaderboardRow } from "@/types/database";

export const metadata = { title: "My students" };

export default async function MyStudentsPage() {
  await requireAdmin();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("my_students_leaderboard");
  const rows = (data ?? []) as MyStudentLeaderboardRow[];

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin" className="text-sm text-muted hover:text-foreground">
          ← Admin
        </Link>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Star className="h-6 w-6 text-emerald-500" /> My students
        </h1>
        <p className="text-muted">
          A private leaderboard of your students only — they can’t see this.
        </p>
      </div>

      {error ? (
        <p className="text-sm text-danger">Couldn’t load the leaderboard: {error.message}</p>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">
          No students yet. Mark someone as a “My student” in{" "}
          <Link href="/admin/members" className="text-primary underline">
            Members
          </Link>
          .
        </div>
      ) : (
        <Card className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-5 py-3 font-medium">#</th>
                  <th className="px-5 py-3 font-medium">Student</th>
                  <th className="px-5 py-3 text-right font-medium">Rating</th>
                  <th className="px-5 py-3 text-right font-medium">Tests</th>
                  <th className="px-5 py-3 text-right font-medium">XP</th>
                  <th className="px-5 py-3 text-right font-medium">Streak</th>
                  <th className="px-5 py-3 text-right font-medium">Feedback</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-surface-2/50">
                    <td className="px-5 py-3 tabular-nums text-muted">{r.rank}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                          {(r.name || r.email || "U").charAt(0).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <Link
                            href={`/admin/students/${r.id}`}
                            className="truncate font-medium text-primary hover:underline"
                          >
                            {r.name || r.email}
                          </Link>
                          <p className="truncate text-xs text-muted">{r.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right font-semibold tabular-nums">
                      {r.rating}
                      <span className="ml-1 text-xs font-normal text-muted">
                        (peak {r.peak_rating})
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        <Trophy className="h-3.5 w-3.5 text-warning" /> {r.tests_completed}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        <Zap className="h-3.5 w-3.5 text-primary" /> {r.xp}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        <Flame className="h-3.5 w-3.5 text-warning" /> {r.streak}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <FeedbackComposer
                        studentId={r.id}
                        studentName={r.name || r.email || "Student"}
                        size="sm"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
