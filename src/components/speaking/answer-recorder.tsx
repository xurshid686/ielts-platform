"use client";

import { useRef, useState } from "react";
import { Mic, Square, Send, Trash2, Loader2, Check } from "lucide-react";
import { sendSpeakingRecording } from "@/app/actions/send-recording";

type Status = "idle" | "recording" | "recorded" | "sending" | "sent";

/** Decode the recorded audio and re-encode it as MP3 in the browser. */
async function encodeToMp3(blob: Blob): Promise<Blob> {
  const arrayBuf = await blob.arrayBuffer();
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new AudioCtx();
  const audio = await ctx.decodeAudioData(arrayBuf);
  await ctx.close();

  const ch0 = audio.getChannelData(0);
  const ch1 = audio.numberOfChannels > 1 ? audio.getChannelData(1) : null;
  const len = ch0.length;
  const samples = new Int16Array(len);
  for (let i = 0; i < len; i++) {
    let s = ch1 ? (ch0[i] + ch1[i]) / 2 : ch0[i]; // down-mix to mono
    s = Math.max(-1, Math.min(1, s));
    samples[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  const lamejs = await import("@breezystack/lamejs");
  const enc = new lamejs.Mp3Encoder(1, audio.sampleRate, 128);
  const block = 1152;
  const out: Uint8Array[] = [];
  for (let i = 0; i < samples.length; i += block) {
    const buf = enc.encodeBuffer(samples.subarray(i, i + block));
    if (buf.length > 0) out.push(new Uint8Array(buf));
  }
  const end = enc.flush();
  if (end.length > 0) out.push(new Uint8Array(end));
  return new Blob(out as BlobPart[], { type: "audio/mpeg" });
}

export function AnswerRecorder({
  topicTitle,
  prompt,
  canSendToTeacher,
}: {
  topicTitle: string;
  prompt: string;
  canSendToTeacher: boolean;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
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
    setConfirming(false);
  }

  async function send() {
    if (!blobRef.current) return;
    setConfirming(false);
    setStatus("sending");
    setError(null);
    const fd = new FormData();
    try {
      const mp3 = await encodeToMp3(blobRef.current);
      fd.append("audio", mp3, "answer.mp3");
    } catch {
      // If MP3 conversion isn't supported in this browser, send the original.
      const ext = blobRef.current.type.includes("ogg") ? "ogg" : "webm";
      fd.append("audio", blobRef.current, `answer.${ext}`);
    }
    fd.append("topicTitle", topicTitle);
    fd.append("prompt", prompt);
    const res = await sendSpeakingRecording(fd);
    if (res.ok) {
      setStatus("sent");
    } else {
      setError(res.error);
      setStatus("recorded");
    }
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

        {(status === "recorded" || status === "sending" || status === "sent") && url && (
          <audio controls src={url} className="h-9 max-w-full" />
        )}

        {(status === "recorded" || status === "sent") && (
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-2 text-xs font-medium hover:bg-surface-2"
          >
            <Trash2 className="h-3.5 w-3.5" /> Re-record
          </button>
        )}

        {canSendToTeacher && status === "recorded" && !confirming && (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:opacity-90"
          >
            <Send className="h-3.5 w-3.5" /> Send to teacher
          </button>
        )}

        {status === "sending" && (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Sending…
          </span>
        )}

        {status === "sent" && (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600">
            <Check className="h-3.5 w-3.5" /> Sent to your teacher
          </span>
        )}
      </div>

      {confirming && (
        <div className="mt-3 rounded-lg border border-emerald-600/30 bg-emerald-600/5 p-3">
          <p className="text-sm font-medium">
            Are you sure you want to share this recording with your teacher?
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={send}
              className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90"
            >
              <Send className="h-3.5 w-3.5" /> Yes, send it
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="inline-flex items-center rounded-full border border-border px-4 py-1.5 text-xs font-medium hover:bg-surface-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
    </div>
  );
}
