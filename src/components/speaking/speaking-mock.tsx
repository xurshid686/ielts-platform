"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Loader2, Flame, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Recorder } from "@/components/speaking/recorder";
import { FeedbackView } from "@/components/speaking/feedback-view";
import { submitSpeakingMock, type SubmitSpeakingResult } from "@/app/actions/speaking";
import type { SpeakingTopic } from "@/lib/ielts/speaking-prompts";

type Step = "intro" | "part1" | "part2prep" | "part2" | "part3" | "submitting" | "result";

const PREP_SECONDS = 60;

export function SpeakingMock({ topic }: { topic: SpeakingTopic }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("intro");
  const [blobs, setBlobs] = useState<Record<number, Blob | null>>({ 1: null, 2: null, 3: null });
  const [prepLeft, setPrepLeft] = useState(PREP_SECONDS);
  const [result, setResult] = useState<SubmitSpeakingResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Part 2 preparation countdown (prepLeft is reset on entry to this step).
  useEffect(() => {
    if (step !== "part2prep") return;
    const iv = setInterval(() => {
      setPrepLeft((s) => {
        if (s <= 1) {
          clearInterval(iv);
          setStep("part2");
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [step]);

  const setBlob = (part: number) => (b: Blob | null) =>
    setBlobs((prev) => ({ ...prev, [part]: b }));

  async function submit() {
    if (!blobs[1] || !blobs[2] || !blobs[3]) {
      setError("Please record all three parts first.");
      return;
    }
    setStep("submitting");
    setError(null);
    const fd = new FormData();
    fd.set("topicId", topic.id);
    fd.set("part1", new File([blobs[1]], "part1.wav", { type: "audio/wav" }));
    fd.set("part2", new File([blobs[2]], "part2.wav", { type: "audio/wav" }));
    fd.set("part3", new File([blobs[3]], "part3.wav", { type: "audio/wav" }));

    const res = await submitSpeakingMock(fd);
    setResult(res);
    if (!res.ok) {
      setError(res.error);
      setStep("part3");
      return;
    }
    router.refresh();
    setStep("result");
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push("/speaking")}
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Speaking
        </button>
        <span className="text-sm font-medium text-muted">{topic.title}</span>
      </div>

      {step !== "result" && step !== "submitting" && <Progress step={step} />}

      {/* Intro */}
      {step === "intro" && (
        <div className="space-y-4 rounded-2xl border border-border bg-surface p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold">{topic.title}</h1>
              <p className="text-sm text-muted">{topic.blurb}</p>
            </div>
          </div>
          <ul className="space-y-2 text-sm text-muted">
            <li>• <strong className="text-foreground">Part 1</strong> — short questions about you (record up to 90s).</li>
            <li>• <strong className="text-foreground">Part 2</strong> — a cue card with 1 minute to prepare, then talk for up to 2 minutes.</li>
            <li>• <strong className="text-foreground">Part 3</strong> — a discussion of broader ideas (up to 2 minutes).</li>
          </ul>
          <p className="text-xs text-muted">
            You&apos;ll need to allow microphone access. After Part 3 your answers are
            assessed and you get a band estimate with feedback.
          </p>
          <Button onClick={() => setStep("part1")}>
            Begin <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Part 1 */}
      {step === "part1" && (
        <PartCard
          title="Part 1 — Interview"
          hint="Answer each question with a sentence or two. Record once for all questions."
        >
          <ol className="mb-4 space-y-2 text-sm">
            {topic.part1.map((q, i) => (
              <li key={i} className="flex gap-2">
                <span className="font-semibold text-primary">{i + 1}.</span> {q}
              </li>
            ))}
          </ol>
          <Recorder maxSeconds={90} onRecorded={setBlob(1)} />
          <NextBar
            disabled={!blobs[1]}
            onNext={() => {
              setPrepLeft(PREP_SECONDS);
              setStep("part2prep");
            }}
            label="Next: Part 2"
          />
        </PartCard>
      )}

      {/* Part 2 prep */}
      {step === "part2prep" && (
        <PartCard title="Part 2 — Preparation" hint="You have 1 minute to prepare. Make notes if you like.">
          <CueCard topic={topic} />
          <div className="mt-4 flex items-center justify-between rounded-xl bg-surface-2 p-4">
            <span className="text-sm text-muted">Preparation time</span>
            <span className="text-2xl font-bold text-primary">0:{String(prepLeft).padStart(2, "0")}</span>
          </div>
          <NextBar onNext={() => setStep("part2")} label="I'm ready — start talking" />
        </PartCard>
      )}

      {/* Part 2 long turn */}
      {step === "part2" && (
        <PartCard title="Part 2 — Long turn" hint="Speak for up to 2 minutes, covering all the points.">
          <CueCard topic={topic} />
          <div className="mt-4">
            <Recorder maxSeconds={120} onRecorded={setBlob(2)} />
          </div>
          <NextBar disabled={!blobs[2]} onNext={() => setStep("part3")} label="Next: Part 3" />
        </PartCard>
      )}

      {/* Part 3 */}
      {step === "part3" && (
        <PartCard
          title="Part 3 — Discussion"
          hint="Give fuller answers with reasons and examples. Record once for all questions."
        >
          <ol className="mb-4 space-y-2 text-sm">
            {topic.part3.map((q, i) => (
              <li key={i} className="flex gap-2">
                <span className="font-semibold text-primary">{i + 1}.</span> {q}
              </li>
            ))}
          </ol>
          <Recorder maxSeconds={120} onRecorded={setBlob(3)} />
          {error && <p className="mt-3 text-sm text-danger">{error}</p>}
          <div className="mt-5 flex justify-end">
            <Button onClick={submit} disabled={!blobs[3]}>
              Finish & get feedback <Sparkles className="h-4 w-4" />
            </Button>
          </div>
        </PartCard>
      )}

      {/* Submitting */}
      {step === "submitting" && (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-surface p-12 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <div>
            <p className="font-medium">Assessing your speaking…</p>
            <p className="text-sm text-muted">Uploading audio and asking the examiner. This can take up to a minute.</p>
          </div>
        </div>
      )}

      {/* Result */}
      {step === "result" && result?.ok && (
        <div className="space-y-5">
          <div className="flex items-center gap-2 rounded-xl border border-success/30 bg-success/5 px-4 py-3 text-sm">
            <Flame className="h-4 w-4 text-warning" />
            Saved! {result.streak}-day streak · {result.xp} XP
          </div>

          {result.feedback ? (
            <FeedbackView feedback={result.feedback} />
          ) : (
            <div className="rounded-2xl border border-border bg-surface p-6 text-center">
              <p className="font-medium">Recording saved ✅</p>
              <p className="mt-1 text-sm text-muted">{result.aiError}</p>
            </div>
          )}

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => router.push("/speaking")}>
              Back to Speaking
            </Button>
            <Button onClick={() => router.refresh()} asChild>
              <a href={`/speaking/${topic.id}`}>Try again</a>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Progress({ step }: { step: Step }) {
  const order: Step[] = ["part1", "part2prep", "part3"];
  const labels = ["Part 1", "Part 2", "Part 3"];
  const current =
    step === "intro" ? -1 : step === "part2" ? 1 : order.indexOf(step);
  return (
    <div className="flex items-center gap-2">
      {labels.map((l, i) => (
        <div key={l} className="flex flex-1 items-center gap-2">
          <div
            className={`h-1.5 flex-1 rounded-full ${
              i <= current ? "bg-primary" : "bg-surface-2"
            }`}
          />
        </div>
      ))}
    </div>
  );
}

function PartCard({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3 rounded-2xl border border-border bg-surface p-6">
      <div>
        <h2 className="text-lg font-bold">{title}</h2>
        <p className="text-sm text-muted">{hint}</p>
      </div>
      {children}
    </div>
  );
}

function CueCard({ topic }: { topic: SpeakingTopic }) {
  return (
    <div className="rounded-xl border border-border bg-surface-2 p-4">
      <p className="font-semibold">{topic.part2.cue}</p>
      <p className="mt-2 text-sm text-muted">You should say:</p>
      <ul className="mt-1 space-y-1 text-sm">
        {topic.part2.bullets.map((b, i) => (
          <li key={i}>• {b}</li>
        ))}
      </ul>
    </div>
  );
}

function NextBar({
  onNext,
  label,
  disabled = false,
}: {
  onNext: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div className="mt-5 flex justify-end">
      <Button onClick={onNext} disabled={disabled}>
        {label} <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
