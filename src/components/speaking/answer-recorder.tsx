"use client";

import { useRef, useState } from "react";
import { Mic, Square, Trash2 } from "lucide-react";

type Status = "idle" | "recording" | "recorded";

export function AnswerRecorder() {
  const [status, setStatus] = useState<Status>("idle");
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")
        ? "audio/ogg;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "";
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType });
        blobRef.current = blob;
        if (url) URL.revokeObjectURL(url);
        setUrl(URL.createObjectURL(blob));
        setStatus("recorded");
        stream.getTracks().forEach((t) => t.stop());
      };
      recorderRef.current = rec;
      rec.start();
      setStatus("recording");
    } catch {
      setError("Microphone access was blocked. Please allow it and try again.");
    }
  }

  function stop() {
    recorderRef.current?.stop();
  }

  function reset() {
    if (url) URL.revokeObjectURL(url);
    blobRef.current = null;
    setUrl(null);
    setStatus("idle");
    setError(null);
  }

  return (
    <div className="rounded-xl border border-border/70 bg-background/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        {status === "idle" && (
          <button
            type="button"
            onClick={start}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
          >
            <Mic className="h-3.5 w-3.5" /> Record your answer
          </button>
        )}

        {status === "recording" && (
          <button
            type="button"
            onClick={stop}
            className="inline-flex items-center gap-1.5 rounded-full bg-red-500 px-4 py-2 text-xs font-semibold text-white hover:opacity-90"
          >
            <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
            <Square className="h-3.5 w-3.5" /> Stop
          </button>
        )}

        {status === "recorded" && url && (
          <audio controls src={url} className="h-9 max-w-full" />
        )}

        {status === "recorded" && (
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-2 text-xs font-medium hover:bg-surface-2"
          >
            <Trash2 className="h-3.5 w-3.5" /> Re-record
          </button>
        )}

      </div>

      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
    </div>
  );
}
