"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Mic, PhoneOff, Loader2, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LiveSession, type LiveStatus } from "@/lib/live/live-session";
import { buildExaminerInstruction, type SpeakingTopic } from "@/lib/ielts/speaking-prompts";

type Line = { role: "user" | "ai"; text: string };

export function LiveConversation({ topic }: { topic: SpeakingTopic }) {
  const router = useRouter();
  const sessionRef = useRef<LiveSession | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const [status, setStatus] = useState<LiveStatus | "idle">("idle");
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Append a transcript fragment, coalescing consecutive fragments from the
  // same speaker into one line.
  const appendText = (role: "user" | "ai") => (text: string) =>
    setLines((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === role) {
        return [...prev.slice(0, -1), { role, text: last.text + text }];
      }
      return [...prev, { role, text }];
    });

  useEffect(() => {
    return () => sessionRef.current?.stop();
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [lines]);

  async function startCall() {
    setError(null);
    setLines([]);
    const session = new LiveSession({
      onStatus: setStatus,
      onAiSpeaking: setAiSpeaking,
      onUserText: appendText("user"),
      onAiText: appendText("ai"),
      onError: (m) => setError(m),
    });
    sessionRef.current = session;
    await session.start({ systemInstruction: buildExaminerInstruction(topic) });
  }

  function endCall() {
    sessionRef.current?.stop();
    sessionRef.current = null;
  }

  const live = status === "live";
  const connecting = status === "connecting";

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-2xl flex-col">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => {
            endCall();
            router.push("/speaking");
          }}
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Speaking
        </button>
        <span className="text-sm font-medium text-muted">Live · {topic.title}</span>
      </div>

      {/* Stage */}
      <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface p-8 text-center">
        <Orb live={live} aiSpeaking={aiSpeaking} connecting={connecting} />
        <p className="text-sm font-medium">
          {status === "idle" && "Ready when you are"}
          {connecting && "Connecting to your examiner…"}
          {live && (aiSpeaking ? "Examiner is speaking…" : "Listening — go ahead and speak")}
          {status === "closed" && "Conversation ended"}
          {status === "error" && "Something went wrong"}
        </p>
        {status === "idle" && (
          <p className="max-w-sm text-xs text-muted">
            You&apos;ll talk with an AI examiner about{" "}
            <strong>{topic.title.toLowerCase()}</strong>. Allow microphone access, then
            just speak naturally — interrupt any time.
          </p>
        )}

        <div className="mt-2 flex gap-3">
          {status === "idle" || status === "closed" || status === "error" ? (
            <Button onClick={startCall} size="lg">
              <Mic className="h-5 w-5" /> {status === "idle" ? "Start conversation" : "Start again"}
            </Button>
          ) : (
            <Button onClick={endCall} variant="danger" size="lg" disabled={connecting}>
              <PhoneOff className="h-5 w-5" /> End
            </Button>
          )}
        </div>

        {error && <p className="mt-1 text-sm text-danger">{error}</p>}
      </div>

      {/* Transcript */}
      <div
        ref={logRef}
        className="mt-5 flex-1 space-y-3 overflow-y-auto rounded-2xl border border-border bg-surface p-5"
      >
        {lines.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">
            The live transcript will appear here as you talk.
          </p>
        ) : (
          lines.map((l, i) => (
            <div
              key={i}
              className={`flex ${l.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                  l.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-surface-2 text-foreground"
                }`}
              >
                <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide opacity-70">
                  {l.role === "user" ? "You" : "Examiner"}
                </span>
                {l.text}
              </div>
            </div>
          ))
        )}
      </div>

      <p className="mt-3 text-center text-xs text-muted">
        Free-talk practice · band scoring for live sessions is coming next.
      </p>
    </div>
  );
}

function Orb({
  live,
  aiSpeaking,
  connecting,
}: {
  live: boolean;
  aiSpeaking: boolean;
  connecting: boolean;
}) {
  return (
    <div className="relative flex h-28 w-28 items-center justify-center">
      {live && (
        <span
          className={`absolute inset-0 rounded-full ${
            aiSpeaking ? "bg-primary/20" : "bg-success/20"
          } animate-ping`}
        />
      )}
      <div
        className={`relative flex h-20 w-20 items-center justify-center rounded-full transition-colors ${
          connecting
            ? "bg-surface-2 text-muted"
            : aiSpeaking
              ? "bg-primary/15 text-primary"
              : live
                ? "bg-success/15 text-success"
                : "bg-surface-2 text-muted"
        }`}
      >
        {connecting ? (
          <Loader2 className="h-8 w-8 animate-spin" />
        ) : aiSpeaking ? (
          <Volume2 className="h-8 w-8" />
        ) : (
          <Mic className="h-8 w-8" />
        )}
      </div>
    </div>
  );
}
