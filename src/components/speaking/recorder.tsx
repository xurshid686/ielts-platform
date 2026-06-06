"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square, RotateCcw, Loader2 } from "lucide-react";
import { blobToWav, pickRecorderMime } from "@/lib/audio/wav";

type Status = "idle" | "recording" | "processing" | "recorded";

function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Records one answer. Captures via MediaRecorder, converts to a 16 kHz mono WAV,
 * and hands the Blob to the parent. Auto-stops at maxSeconds.
 */
export function Recorder({
  maxSeconds = 120,
  onRecorded,
  disabled = false,
}: {
  maxSeconds?: number;
  onRecorded: (wav: Blob | null) => void;
  disabled?: boolean;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [seconds, setSeconds] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopTracks() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }

  useEffect(() => {
    return () => {
      stopTracks();
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function start() {
    setError(null);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    onRecorded(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const mime = pickRecorderMime();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorderRef.current = rec;

      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        stopTracks();
        setStatus("processing");
        try {
          const raw = new Blob(chunksRef.current, {
            type: rec.mimeType || "audio/webm",
          });
          const wav = await blobToWav(raw);
          const url = URL.createObjectURL(wav);
          setAudioUrl(url);
          onRecorded(wav);
          setStatus("recorded");
        } catch {
          setError("Couldn't process the recording. Please try again.");
          setStatus("idle");
        }
      };

      rec.start();
      setSeconds(0);
      setStatus("recording");
      timerRef.current = setInterval(() => {
        setSeconds((s) => {
          const next = s + 1;
          if (next >= maxSeconds) stop();
          return next;
        });
      }, 1000);
    } catch {
      setError("Microphone access was blocked. Allow it in your browser to record.");
      setStatus("idle");
    }
  }

  function stop() {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {status === "idle" && (
          <button
            type="button"
            disabled={disabled}
            onClick={start}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <Mic className="h-5 w-5" /> Record
          </button>
        )}

        {status === "recording" && (
          <button
            type="button"
            onClick={stop}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-danger px-5 font-medium text-white hover:opacity-90"
          >
            <Square className="h-4 w-4 fill-current" /> Stop
          </button>
        )}

        {status === "processing" && (
          <span className="inline-flex h-11 items-center gap-2 rounded-full border border-border px-5 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Processing…
          </span>
        )}

        {status === "recorded" && (
          <button
            type="button"
            disabled={disabled}
            onClick={start}
            className="inline-flex h-11 items-center gap-2 rounded-full border border-border px-5 text-sm hover:bg-surface-2 disabled:opacity-50"
          >
            <RotateCcw className="h-4 w-4" /> Re-record
          </button>
        )}

        {status === "recording" && (
          <span className="inline-flex items-center gap-2 text-sm font-medium text-danger">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-danger" />
            {fmt(seconds)} / {fmt(maxSeconds)}
          </span>
        )}
      </div>

      {audioUrl && status === "recorded" && (
        <audio src={audioUrl} controls className="h-10 w-full max-w-md" />
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
