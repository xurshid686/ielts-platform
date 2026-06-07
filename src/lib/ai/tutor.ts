// Gemini-backed IELTS tutor that answers a student's questions about a specific
// test (its passage, questions, answers, and strategy). Server-only.
import "server-only";
import { GeminiError, GeminiKeyMissing } from "@/lib/ai/gemini";

const MODEL = "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export type ChatMsg = { role: "user" | "model"; text: string };

function systemInstruction(context: string): string {
  return [
    "You are a friendly, encouraging IELTS tutor helping a student understand a",
    "specific practice test. Use ONLY the test content below to answer.",
    "- Explain why an answer is correct, citing evidence from the passage/transcript.",
    "- Explain question types, tricky vocabulary, paraphrasing, and strategy.",
    "- Be concise (a few short paragraphs max) and supportive.",
    "- If the student asks about something not in this test, say so briefly.",
    "Do NOT just dump all the answers unprompted; help them learn.",
    "",
    "=== TEST CONTENT ===",
    context,
  ].join("\n");
}

export async function askTutor(context: string, messages: ChatMsg[]): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new GeminiKeyMissing();

  const res = await fetch(`${ENDPOINT}?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction(context) }] },
      contents: messages.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
      generationConfig: { temperature: 0.4, maxOutputTokens: 800 },
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
  if (!text) throw new GeminiError("Empty tutor response");
  return text;
}
