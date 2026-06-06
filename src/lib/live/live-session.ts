// Browser-side manager for a Gemini Live API voice conversation.
//
// Flow: fetch an ephemeral token from /api/live-token -> open the Live WebSocket
// (BidiGenerateContentConstrained, authed with ?access_token) -> send the setup
// message -> stream microphone audio (16 kHz PCM) up and play model audio
// (24 kHz PCM) back, handling barge-in (interrupted) and live transcripts.
//
// The real GEMINI_API_KEY never reaches the browser — only the short-lived token.

const WS_BASE =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained";

const IN_RATE = 16000;
const OUT_RATE = 24000;

// AudioWorklet that converts mic frames to 16-bit PCM and posts them in ~128 ms
// batches (keeps the socket from being flooded with tiny messages).
const CAPTURE_WORKLET = `
class CaptureProcessor extends AudioWorkletProcessor {
  constructor() { super(); this._buf = new Int16Array(0); }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    const add = new Int16Array(ch.length);
    for (let i = 0; i < ch.length; i++) {
      let s = Math.max(-1, Math.min(1, ch[i]));
      add[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    const merged = new Int16Array(this._buf.length + add.length);
    merged.set(this._buf); merged.set(add, this._buf.length);
    this._buf = merged;
    if (this._buf.length >= 2048) {
      this.port.postMessage(this._buf.buffer, [this._buf.buffer]);
      this._buf = new Int16Array(0);
    }
    return true;
  }
}
registerProcessor('capture', CaptureProcessor);
`;

export type LiveStatus = "connecting" | "live" | "closed" | "error";

export type LiveCallbacks = {
  onStatus?: (s: LiveStatus) => void;
  onAiSpeaking?: (speaking: boolean) => void;
  onUserText?: (text: string) => void; // input transcription (what you said)
  onAiText?: (text: string) => void; // output transcription (what the AI said)
  onError?: (message: string) => void;
};

type Setup = { systemInstruction: string };

const FALLBACK_MODEL = "gemini-2.5-flash-native-audio-latest";

function base64FromBuffer(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function int16FromBase64(b64: string): Int16Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

export class LiveSession {
  private ws: WebSocket | null = null;
  private micCtx: AudioContext | null = null;
  private playCtx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private sources = new Set<AudioBufferSourceNode>();
  private playCursor = 0;
  private aiSpeaking = false;
  private closed = false;

  constructor(private cb: LiveCallbacks) {}

  async start(setup: Setup) {
    this.cb.onStatus?.("connecting");
    try {
      // 1) ephemeral token
      const tokenRes = await fetch("/api/live-token", { method: "POST" });
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok) throw new Error(tokenData.error || "Token request failed");
      const token: string = tokenData.token;
      const model: string = tokenData.model || FALLBACK_MODEL;

      // 2) microphone + capture worklet (16 kHz mono)
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      });
      this.micCtx = new AudioContext({ sampleRate: IN_RATE });
      const blobUrl = URL.createObjectURL(
        new Blob([CAPTURE_WORKLET], { type: "application/javascript" }),
      );
      await this.micCtx.audioWorklet.addModule(blobUrl);
      URL.revokeObjectURL(blobUrl);

      this.playCtx = new AudioContext({ sampleRate: OUT_RATE });

      // 3) WebSocket
      const ws = new WebSocket(`${WS_BASE}?access_token=${token}`);
      this.ws = ws;

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            setup: {
              model: `models/${model}`,
              generationConfig: { responseModalities: ["AUDIO"] },
              systemInstruction: { parts: [{ text: setup.systemInstruction }] },
              inputAudioTranscription: {},
              outputAudioTranscription: {},
            },
          }),
        );
      };

      ws.onmessage = (ev) => this.handleMessage(ev);
      ws.onerror = () => this.fail("Connection error.");
      ws.onclose = () => {
        if (!this.closed) {
          this.closed = true;
          this.cleanup();
          this.cb.onStatus?.("closed");
        }
      };
    } catch (e) {
      this.fail(e instanceof Error ? e.message : "Could not start the session.");
    }
  }

  private beginCapture() {
    if (!this.micCtx || !this.stream) return;
    const src = this.micCtx.createMediaStreamSource(this.stream);
    const node = new AudioWorkletNode(this.micCtx, "capture");
    node.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
      if (this.ws?.readyState !== WebSocket.OPEN) return;
      this.ws.send(
        JSON.stringify({
          realtimeInput: {
            audio: {
              data: base64FromBuffer(e.data),
              mimeType: `audio/pcm;rate=${IN_RATE}`,
            },
          },
        }),
      );
    };
    src.connect(node);
    // Worklet has no audible output; connect to destination to keep it pulling.
    node.connect(this.micCtx.destination);
    this.workletNode = node;
  }

  private async handleMessage(ev: MessageEvent) {
    const text =
      typeof ev.data === "string"
        ? ev.data
        : await (ev.data as Blob).text().catch(() => "");
    if (!text) return;
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }

    if (msg.setupComplete) {
      this.beginCapture();
      this.cb.onStatus?.("live");
      return;
    }

    const sc = msg.serverContent as
      | {
          modelTurn?: { parts?: { inlineData?: { data?: string } }[] };
          inputTranscription?: { text?: string };
          outputTranscription?: { text?: string };
          interrupted?: boolean;
          turnComplete?: boolean;
        }
      | undefined;
    if (!sc) return;

    if (sc.interrupted) this.stopPlayback(); // user barged in
    if (sc.inputTranscription?.text) this.cb.onUserText?.(sc.inputTranscription.text);
    if (sc.outputTranscription?.text) this.cb.onAiText?.(sc.outputTranscription.text);

    for (const part of sc.modelTurn?.parts ?? []) {
      const data = part.inlineData?.data;
      if (data) this.enqueueAudio(int16FromBase64(data));
    }

    if (sc.turnComplete) this.setAiSpeaking(false);
  }

  private enqueueAudio(int16: Int16Array) {
    if (!this.playCtx) return;
    const f32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) f32[i] = int16[i] / 32768;
    const buffer = this.playCtx.createBuffer(1, f32.length, OUT_RATE);
    buffer.copyToChannel(f32, 0);
    const node = this.playCtx.createBufferSource();
    node.buffer = buffer;
    node.connect(this.playCtx.destination);

    const now = this.playCtx.currentTime;
    if (this.playCursor < now) this.playCursor = now;
    node.start(this.playCursor);
    this.playCursor += buffer.duration;
    this.setAiSpeaking(true);

    this.sources.add(node);
    node.onended = () => {
      this.sources.delete(node);
      if (this.sources.size === 0) this.setAiSpeaking(false);
    };
  }

  private stopPlayback() {
    this.sources.forEach((s) => {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    });
    this.sources.clear();
    this.playCursor = 0;
    this.setAiSpeaking(false);
  }

  private setAiSpeaking(v: boolean) {
    if (v !== this.aiSpeaking) {
      this.aiSpeaking = v;
      this.cb.onAiSpeaking?.(v);
    }
  }

  private fail(message: string) {
    if (this.closed) return;
    this.closed = true;
    this.cb.onError?.(message);
    this.cb.onStatus?.("error");
    this.cleanup();
  }

  private cleanup() {
    this.stopPlayback();
    try {
      this.workletNode?.disconnect();
    } catch {}
    this.stream?.getTracks().forEach((t) => t.stop());
    this.micCtx?.close().catch(() => {});
    this.playCtx?.close().catch(() => {});
    this.stream = null;
    this.micCtx = null;
    this.playCtx = null;
    this.workletNode = null;
  }

  stop() {
    if (this.closed) {
      this.cleanup();
      return;
    }
    this.closed = true;
    try {
      this.ws?.close();
    } catch {}
    this.cleanup();
    this.cb.onStatus?.("closed");
  }
}
