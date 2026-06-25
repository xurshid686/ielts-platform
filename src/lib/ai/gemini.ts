// Gemini client for IELTS Speaking assessment. Sends the candidate's recorded
// answers (audio) plus the exact questions, and asks Gemini to act as an
// examiner: transcribe, score the four criteria, and return structured JSON.
//
// Server-only. Needs GEMINI_API_KEY (https://aistudio.google.com/apikey).
import "server-only";
import type { SpeakingFeedback, SpeakingStudy } from "@/types/database";

const MODEL = "gemini-2.5-flash"; // strong audio understanding, fast + cheap
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export class GeminiError extends Error {}
export class GeminiKeyMissing extends GeminiError {
  constructor() {
    super("GEMINI_API_KEY is not set");
  }
}

export type SpeakingAudioPart = {
  part: number;
  questions: string[];
  mimeType: string;
  base64: string;
};

const criterion = {
  type: "object",
  properties: {
    band: { type: "number" },
    comment: { type: "string" },
  },
  required: ["band", "comment"],
} as const;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    overallBand: { type: "number" },
    criteria: {
      type: "object",
      properties: {
        fluency: criterion,
        lexical: criterion,
        grammar: criterion,
        pronunciation: criterion,
      },
      required: ["fluency", "lexical", "grammar", "pronunciation"],
    },
    strengths: { type: "array", items: { type: "string" } },
    improvements: { type: "array", items: { type: "string" } },
    partFeedback: {
      type: "array",
      items: {
        type: "object",
        properties: { part: { type: "integer" }, comment: { type: "string" } },
        required: ["part", "comment"],
      },
    },
    transcript: { type: "string" },
  },
  required: [
    "overallBand",
    "criteria",
    "strengths",
    "improvements",
    "partFeedback",
    "transcript",
  ],
} as const;

function instruction(topicTitle: string, parts: SpeakingAudioPart[]): string {
  const qs = parts
    .map(
      (p) =>
        `Part ${p.part} questions:\n` +
        p.questions.map((q, i) => `  ${i + 1}. ${q}`).join("\n"),
    )
    .join("\n\n");

  return [
    "You are a certified IELTS Speaking examiner. The candidate's spoken answers",
    `for the topic "${topicTitle}" are attached as audio, in order (Part 1, then`,
    "Part 2 long turn, then Part 3). The questions for each part are below.",
    "",
    qs,
    "",
    "Assess the candidate using the official IELTS Speaking band descriptors on",
    "the four criteria: Fluency & Coherence (fluency), Lexical Resource (lexical),",
    "Grammatical Range & Accuracy (grammar), and Pronunciation. Give each a band",
    "from 0 to 9 in 0.5 steps, plus an overall band (rounded to the nearest 0.5).",
    "For each criterion give one specific, constructive comment citing what the",
    "candidate actually said. Provide 2-4 concrete strengths, 2-4 concrete",
    "improvements, a short comment per part, and a faithful transcript of all",
    "parts (label them 'Part 1:', 'Part 2:', 'Part 3:'). Be encouraging but honest.",
  ].join("\n");
}

/** Grades a 3-part speaking session. Throws GeminiKeyMissing / GeminiError. */
export async function gradeSpeaking(
  topicTitle: string,
  parts: SpeakingAudioPart[],
): Promise<SpeakingFeedback> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new GeminiKeyMissing();

  const contentParts: object[] = [{ text: instruction(topicTitle, parts) }];
  for (const p of parts) {
    contentParts.push({ text: `[Audio for Part ${p.part}]` });
    contentParts.push({ inline_data: { mime_type: p.mimeType, data: p.base64 } });
  }

  const res = await fetch(`${ENDPOINT}?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: contentParts }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0.4,
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new GeminiError(`Gemini API ${res.status}: ${detail.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    promptFeedback?: { blockReason?: string };
  };

  if (data.promptFeedback?.blockReason) {
    throw new GeminiError(`Blocked: ${data.promptFeedback.blockReason}`);
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new GeminiError("Empty response from Gemini");

  let parsed: SpeakingFeedback;
  try {
    parsed = JSON.parse(text) as SpeakingFeedback;
  } catch {
    throw new GeminiError("Could not parse Gemini JSON");
  }
  return parsed;
}

// ---- Practice / study material generation --------------------------------

const STUDY_SCHEMA = {
  type: "object",
  properties: {
    ideas: { type: "array", items: { type: "string" } },
    vocabulary: {
      type: "array",
      items: {
        type: "object",
        properties: {
          term: { type: "string" },
          meaning: { type: "string" },
          example: { type: "string" },
        },
        required: ["term", "meaning", "example"],
      },
    },
    samples: {
      type: "array",
      items: {
        type: "object",
        properties: {
          prompt: { type: "string" },
          answer: { type: "string" },
        },
        required: ["prompt", "answer"],
      },
    },
  },
  required: ["ideas", "vocabulary", "samples"],
} as const;

function studyInstruction(part: number, title: string, questions: string): string {
  const sampleRule =
    part === 2
      ? `For "samples", give ONE entry: prompt = "Model long-turn answer", answer = a natural, well-organised ~220-word band 8 monologue that covers all the cue-card bullet points.`
      : `For "samples", give one entry per question above: prompt = the question, answer = a natural, fluent band 8 spoken answer (2-4 sentences for Part 1, 4-6 sentences for Part 3) that a strong candidate might actually say.`;
  return [
    `You are an expert IELTS Speaking coach. Create practice material for this IELTS Speaking Part ${part} topic.`,
    `Topic title: ${title}`,
    `Questions:\n${questions}`,
    ``,
    `Return JSON with:`,
    `- "ideas": 6-8 concise talking points / angles a candidate can use to develop answers on this topic.`,
    `- "vocabulary": 8-12 useful topic-specific words or collocations. Each: "term", a short "meaning", and a natural "example" sentence using it on this topic.`,
    `- "samples": ${sampleRule}`,
    ``,
    `Use natural, idiomatic English at IELTS band 8. Keep meanings short and clear. Do not use markdown.`,
  ].join("\n");
}

export async function generateSpeakingStudy(
  part: number,
  title: string,
  questions: string,
): Promise<SpeakingStudy> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new GeminiKeyMissing();

  const res = await fetch(`${ENDPOINT}?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: studyInstruction(part, title, questions) }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: STUDY_SCHEMA,
        temperature: 0.7,
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new GeminiError(`Gemini API ${res.status}: ${detail.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    promptFeedback?: { blockReason?: string };
  };
  if (data.promptFeedback?.blockReason) {
    throw new GeminiError(`Blocked: ${data.promptFeedback.blockReason}`);
  }
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new GeminiError("Empty response from Gemini");

  try {
    return JSON.parse(text) as SpeakingStudy;
  } catch {
    throw new GeminiError("Could not parse Gemini JSON");
  }
}
