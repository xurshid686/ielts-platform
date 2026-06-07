// Gemini IELTS Writing examiner: grades an essay/letter against the four
// official criteria and returns structured JSON. Server-only.
import "server-only";
import { GeminiError, GeminiKeyMissing } from "@/lib/ai/gemini";
import type { WritingFeedback } from "@/types/database";

const MODEL = "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const criterion = {
  type: "object",
  properties: { band: { type: "number" }, comment: { type: "string" } },
  required: ["band", "comment"],
} as const;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    overallBand: { type: "number" },
    criteria: {
      type: "object",
      properties: {
        task: criterion,
        coherence: criterion,
        lexical: criterion,
        grammar: criterion,
      },
      required: ["task", "coherence", "lexical", "grammar"],
    },
    strengths: { type: "array", items: { type: "string" } },
    improvements: { type: "array", items: { type: "string" } },
    corrections: {
      type: "array",
      items: {
        type: "object",
        properties: { original: { type: "string" }, better: { type: "string" } },
        required: ["original", "better"],
      },
    },
    comment: { type: "string" },
  },
  required: ["overallBand", "criteria", "strengths", "improvements", "corrections", "comment"],
} as const;

export async function gradeWriting(
  taskType: "task1" | "task2",
  prompt: string,
  essay: string,
): Promise<WritingFeedback> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new GeminiKeyMissing();

  const criteriaName =
    taskType === "task1" ? "Task Achievement" : "Task Response";
  const instruction = [
    "You are a certified IELTS Writing examiner. Grade the candidate's response",
    `to this IELTS ${taskType === "task1" ? "Task 1" : "Task 2"} prompt using the`,
    "official band descriptors on four criteria: " +
      `${criteriaName} (task), Coherence & Cohesion (coherence), Lexical Resource`,
    "(lexical), and Grammatical Range & Accuracy (grammar).",
    "Give each a band 0–9 in 0.5 steps and an overall band (rounded to 0.5).",
    "For each criterion, give one specific, constructive comment.",
    "Provide 2–4 strengths, 2–4 improvements, and 2–5 'corrections' — short",
    "excerpts from the candidate's own text with a better version.",
    "Be honest but encouraging.",
    "",
    `PROMPT:\n${prompt}`,
    "",
    `CANDIDATE'S RESPONSE:\n${essay}`,
  ].join("\n");

  const res = await fetch(`${ENDPOINT}?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: instruction }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0.3,
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new GeminiError(`Gemini ${res.status}: ${detail.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new GeminiError("Empty writing response");
  try {
    return JSON.parse(text) as WritingFeedback;
  } catch {
    throw new GeminiError("Could not parse writing feedback JSON");
  }
}
