import Link from "next/link";
import { ArrowRight, ClipboardCheck, Headphones, BookOpen, PenLine, Award } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { listMocksForStudent } from "@/lib/mock";
import { STATUS_LABEL } from "@/lib/mock-shared";
import { isPremiumActive } from "@/lib/premium";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { MockRequestButton } from "@/components/mock/mock-actions";
import { cn, timeAgo } from "@/lib/utils";

export const metadata = { title: "Mock exam" };

export default async function MockListPage() {
  const profile = await requireProfile();
  const cards = await listMocksForStudent(profile.id);
  const isPremium = isPremiumActive(profile);

  return (
    <div className="space-y-6">
      <header className="flex items-start gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <ClipboardCheck className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-2xl font-bold">Mock exam</h1>
          <p className="text-sm text-muted">
            A full IELTS mock — Listening, Reading, then Writing — sat once, in exam conditions.
            Premium members join instantly; others request a place and your teacher approves it.
            Your result is released after marking.
          </p>
        </div>
      </header>

      {cards.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheck />}
          title="No mock exams open right now"
          desc="When your teacher opens a mock, it will appear here for you to request."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {cards.map(({ mock, request, attempt }) => (
            <Card key={mock.id} className="flex flex-col gap-4">
              <div>
                <h2 className="text-lg font-semibold">{mock.title}</h2>
                {mock.description && <p className="mt-1 text-sm text-muted">{mock.description}</p>}
                <p className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted">
                  <span className="inline-flex items-center gap-1">
                    <Headphones className="h-3.5 w-3.5" /> Listening
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <BookOpen className="h-3.5 w-3.5" /> Reading
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <PenLine className="h-3.5 w-3.5" /> Writing
                  </span>
                </p>
              </div>

              <div className="mt-auto">
                {!attempt ? (
                  <MockRequestButton
                    mockId={mock.id}
                    mockTitle={mock.title}
                    status={request?.status ?? null}
                    isPremium={isPremium}
                  />
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span
                      className={cn(
                        "rounded-md px-2 py-1 text-xs font-medium",
                        attempt.status === "released"
                          ? "bg-success/10 text-success"
                          : attempt.status === "submitted"
                            ? "bg-surface-2 text-muted"
                            : "bg-primary/10 text-primary",
                      )}
                    >
                      {attempt.status === "approved" && mock.session_state === "waiting"
                        ? "Approved — waiting for the session"
                        : attempt.status === "approved" && mock.session_state === "closed"
                          ? "Session ended"
                          : STATUS_LABEL[attempt.status]}
                      {attempt.status === "submitted" && attempt.submitted_at
                        ? ` · ${timeAgo(attempt.submitted_at)}`
                        : ""}
                    </span>
                    {attempt.status === "released" ? (
                      <Link
                        href={`/mock/${mock.id}/result`}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                      >
                        <Award className="h-4 w-4" /> Overall {attempt.result?.overall?.toFixed(1)}
                      </Link>
                    ) : (
                      <Link
                        href={`/mock/${mock.id}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-2"
                      >
                        {attempt.status === "approved"
                          ? "Open"
                          : attempt.status === "in_progress"
                            ? "Continue"
                            : "View"}{" "}
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    )}
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
