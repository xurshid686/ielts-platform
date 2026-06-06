// Client-side audio helpers. MediaRecorder gives us webm/opus (Chrome) or
// mp4/aac (Safari) — formats Gemini's audio understanding doesn't reliably
// accept. So after recording we decode the blob and re-encode it as a small
// 16 kHz mono WAV, which every browser can produce and Gemini always accepts.

const TARGET_RATE = 16000;

/** Decode any recorded blob, downsample to 16 kHz mono, return a WAV Blob. */
export async function blobToWav(input: Blob): Promise<Blob> {
  const arrayBuf = await input.arrayBuffer();

  // Decode using a throwaway AudioContext (its sample rate doesn't matter —
  // we resample below with an OfflineAudioContext).
  const AC: typeof AudioContext =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const decodeCtx = new AC();
  let decoded: AudioBuffer;
  try {
    decoded = await decodeCtx.decodeAudioData(arrayBuf.slice(0));
  } finally {
    decodeCtx.close();
  }

  // Resample to mono 16 kHz.
  const frames = Math.max(1, Math.ceil(decoded.duration * TARGET_RATE));
  const offline = new OfflineAudioContext(1, frames, TARGET_RATE);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();

  return encodeWav(rendered.getChannelData(0), TARGET_RATE);
}

/** Encode mono float samples (-1..1) into a 16-bit PCM WAV Blob. */
function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // subchunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

/** Pick a MediaRecorder mimeType the current browser actually supports. */
export function pickRecorderMime(): string | undefined {
  const candidates = ["audio/webm", "audio/mp4", "audio/ogg"];
  if (typeof MediaRecorder === "undefined") return undefined;
  return candidates.find((m) => MediaRecorder.isTypeSupported(m));
}
