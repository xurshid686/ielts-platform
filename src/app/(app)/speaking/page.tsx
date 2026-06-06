import Link from "next/link";
import { Mic, ArrowRight, Calendar, Radio, FileAudio } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SPEAKING_TOPICS } from "@/lib/ielts/speaking-prompts";
import { FeedbackView } from "@/components/speaking/feedback-view";
import type { SpeakingSubmission } from "@/types/database";

export default async function SpeakingPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data } = await supabase
    .from("speaking_submissions")
    .select("*")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(10);

  const sessions = (data as SpeakingSubmission[] | null) ?? [];

  // Sign the private audio files for in-page playback.
  const signed = new Map<string, string>();
  const allPaths = sessions.flatMap((s) => s.audio_paths ?? []);
  if (allPaths.length) {
    const { data: urls } = await supabase.storage
      .from("speaking")
      .createSignedUrls(allPaths, 3600);
    urls?.forEach((u) => {
      if (u.signedUrl && u.path) signed.set(u.path, u.signedUrl);
    });
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Mic className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Speaking</h1>
          <p className="text-sm text-muted">
            Talk live with an AI examiner, or take a recorded mock for a band estimate.
          </p>
        </div>
      </div>

      {/* Hero: jump straight into a real-time voice conversation */}
      <Link
        href="/speaking/live/general"
        className="group flex flex-col items-start gap-4 rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 to-surface p-6 transition-colors hover:border-primary/60 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <Radio className="h-7 w-7" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Voice conversation</h2>
            <p className="text-sm text-muted">
              Talk with an AI examiner in real time — it speaks, listens, and replies. No topic needed.
            </p>
          </div>
        </div>
        <span className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-primary px-6 font-medium text-primary-foreground transition-transform group-hover:translate-x-0.5">
          <Mic className="h-5 w-5" /> Start talking
        </span>
      </Link>

      {/* Live conversation by topic */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
          <Radio className="h-4 w-4 text-primary" /> Or practise a specific topic, live
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SPEAKING_TOPICS.map((t) => (
            <Link
              key={t.id}
              href={`/speaking/live/${t.id}`}
              className="group flex flex-col rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-primary/50"
            >
              <span className="inline-flex w-fit items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                Live
              </span>
              <h3 className="mt-2 font-semibold">{t.title}</h3>
              <p className="mt-1 flex-1 text-sm text-muted">{t.blurb}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
                Start conversation{" "}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Recorded mock — secondary */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
          <FileAudio className="h-4 w-4" /> Or take a recorded 3-part mock
        </h2>
        <p className="text-sm text-muted">
          Record Parts 1–3 on your own and get an AI band breakdown with a transcript.
        </p>
        <div className="flex flex-wrap gap-2">
          {SPEAKING_TOPICS.map((t) => (
            <Link
              key={t.id}
              href={`/speaking/${t.id}`}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-4 py-2 text-sm hover:bg-surface-2"
            >
              {t.title}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          ))}
        </div>
      </section>

      {/* History */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Your sessions
        </h2>
        {sessions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted">
            No sessions yet — pick a topic above to take your first mock.
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map((s) => (
              <details
                key={s.id}
                className="rounded-2xl border border-border bg-surface p-5"
              >
                <summary className="flex cursor-pointer items-center justify-between gap-3">
                  <span className="flex items-center gap-3">
                    <span className="flex h-12 w-12 flex-col items-center justify-center rounded-xl bg-primary/10">
                      <span className="text-lg font-bold text-primary">
                        {s.score ?? "—"}
                      </span>
                    </span>
                    <span>
                      <span className="font-medium">{s.prompt ?? "Speaking mock"}</span>
                      <span className="mt-0.5 flex items-center gap-1 text-xs text-muted">
                        <Calendar className="h-3 w-3" />
                        {new Date(s.created_at).toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </span>
                  </span>
                  <span className="text-xs text-muted">details</span>
                </summary>

                <div className="mt-5 space-y-4">
                  {(s.audio_paths ?? []).map((p, i) => {
                    const url = signed.get(p);
                    return (
                      <div key={p} className="space-y-1">
                        <span className="text-xs font-medium text-muted">
                          Part {i + 1}
                        </span>
                        {url ? (
                          <audio src={url} controls className="h-9 w-full max-w-md" />
                        ) : (
                          <p className="text-xs text-muted">Audio unavailable.</p>
                        )}
                      </div>
                    );
                  })}

                  {s.feedback ? (
                    <FeedbackView feedback={s.feedback} />
                  ) : (
                    <p className="text-sm text-muted">
                      No AI feedback was generated for this session.
                    </p>
                  )}
                </div>
              </details>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
