import "server-only";

// Axiom essay-evaluation API client (https://api.axiom.uz).
//
// SERVER ONLY. One service account for the whole site: the JWT never reaches a
// browser, and every student's request goes out under that single login. That
// means Axiom's own history list mixes all our students, so nothing here must
// ever hand `listEvaluations` to a client — our own table is the record.
//
// VERIFIED 2026-11-14 against the real account (scripts/axiom-probe.mjs): the
// collection claims results arrive over SignalR, but process-evaluation actually
// answers SYNCHRONOUSLY (~13 s) with {id, evaluation}, where `evaluation` is the
// feedback as a JSON string. No SignalR client is needed; `connectionId` is
// accepted and ignored, so we send a random one.
//
// Login quirk: phoneNumber must be digits only WITH the country code
// ("998971202405"). "+998 97 ...", "+998971202405" and the bare local number are
// all refused with 400 "Credentials are incorrect".

// An evaluation took 6-13 s in testing; leave room for a slow minute.
const TIMEOUT_MS = 45_000;

export class AxiomError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AxiomError";
  }
}

function config() {
  const base = process.env.AXIOM_BASE_URL?.replace(/\/+$/, "");
  const phone = process.env.AXIOM_PHONE;
  const password = process.env.AXIOM_PASSWORD;
  if (!base || !phone || !password) {
    throw new AxiomError("Axiom is not configured (AXIOM_BASE_URL / AXIOM_PHONE / AXIOM_PASSWORD).", 503);
  }
  return { base, phone, password };
}

// In-process token cache. One DigitalOcean instance today (see rate-limit.ts);
// a second instance would simply log in once itself.
let cached: { token: string; at: number } | null = null;
let inflight: Promise<string> | null = null;
// The JWT's real expiry is not in the collection, so re-login well inside any
// plausible lifetime and also on every 401.
const TOKEN_TTL_MS = 10 * 60_000;

async function login(): Promise<string> {
  const { base, phone, password } = config();
  const res = await fetch(`${base}/accounts/authenticate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phoneNumber: phone, password }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new AxiomError(`Axiom login failed (${res.status}).`, res.status);
  const data = (await res.json()) as { jwtToken?: string };
  if (!data.jwtToken) throw new AxiomError("Axiom login returned no token.", 502);
  cached = { token: data.jwtToken, at: Date.now() };
  return data.jwtToken;
}

async function token(force = false): Promise<string> {
  if (!force && cached && Date.now() - cached.at < TOKEN_TTL_MS) return cached.token;
  // Collapse concurrent logins into one request.
  inflight ??= login().finally(() => {
    inflight = null;
  });
  return inflight;
}

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const { base } = config();
  const send = async (force: boolean) =>
    fetch(`${base}${path}`, {
      ...init,
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
        Authorization: `Bearer ${await token(force)}`,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  let res = await send(false);
  if (res.status === 401) res = await send(true);
  return res;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = (await res.text().catch(() => "")).slice(0, 300);
    throw new AxiomError(`Axiom ${res.status}: ${text || res.statusText}`, res.status);
  }
  return (await res.json()) as T;
}

/** `type` 1 is what every example in the collection uses; its meaning (Academic / GT?) is unconfirmed. */
export interface SubmitText {
  task: 1 | 2;
  topic: string;
  body: string;
  /** Ignored by the API; a random one is generated when omitted. */
  connectionId?: string;
  /** The student's address, for Axiom's own abuse limits. */
  ipAddress?: string;
  type?: number;
  maxToken?: number;
}

/** What process-evaluation returns: the saved evaluation's id and its feedback JSON. */
export interface SubmittedEvaluation {
  id: string;
  /** JSON string; parse with parseEvaluation(). */
  evaluation: string;
}

export interface CriterionFeedback {
  Score: string;
  Description: string;
  Suggestions?: string[];
  Revisions?: { sentenceExample: string; revision: string }[];
}

/** Keys are Axiom's own. Task 1 may name the first criterion differently; keep everything optional. */
export interface EvaluationFeedback {
  Cohesion_and_Coherence?: CriterionFeedback;
  Lexical_Resource?: CriterionFeedback;
  Grammatical_Range_and_Accuracy?: CriterionFeedback;
  Task_Achievement?: CriterionFeedback;
  [other: string]: CriterionFeedback | undefined;
}

export function parseEvaluation(json: string): EvaluationFeedback | null {
  try {
    const v = JSON.parse(json);
    return v && typeof v === "object" ? (v as EvaluationFeedback) : null;
  } catch {
    return null;
  }
}

export async function submitEvaluation(input: SubmitText): Promise<SubmittedEvaluation> {
  const res = await call("/evaluations/process-evaluation", {
    method: "POST",
    body: JSON.stringify({
      type: input.type ?? 1,
      task: input.task,
      topic: input.topic,
      body: input.body,
      maxToken: input.maxToken ?? 1500,
      ipAddress: input.ipAddress ?? "",
      connectionId: input.connectionId ?? crypto.randomUUID(),
    }),
  });
  return json(res);
}

export interface SubmitWithImage {
  topic: string;
  body: string;
  image: Uint8Array;
  /** Including the dot, e.g. ".jpg". */
  imageExtension: string;
  connectionId?: string;
  type?: number;
}

export async function submitEvaluationWithImage(input: SubmitWithImage): Promise<SubmittedEvaluation> {
  const res = await call("/evaluations/process-evaluation-with-image", {
    method: "POST",
    body: JSON.stringify({
      type: input.type ?? 1,
      topic: input.topic,
      body: input.body,
      imageBytes: Buffer.from(input.image).toString("base64"),
      imageExtension: input.imageExtension,
      connectionId: input.connectionId ?? crypto.randomUUID(),
    }),
  });
  return json(res);
}

export interface EvaluationSummary {
  id: string;
  createdAt: string;
  essayTask: number;
  title: string;
  body: string;
  score: number;
  result: string;
}

/** Server-side matching only; never expose this list to a client. */
export async function listEvaluations(pageSize = 20): Promise<{ data: EvaluationSummary[]; total: number }> {
  const qs = new URLSearchParams({
    "sortDescription.ColumnName": "CreatedAt",
    "sortDescription.IsDescending": "true",
    PageSize: String(pageSize),
    PageNumber: "1",
  });
  return json(await call(`/evaluations/get-evaluations?${qs}`));
}

export interface EvaluationDetail {
  overall: number;
  grammaticalRange: number;
  lexicalResource: number;
  taskAchievement: number;
  cohesionAndCoherence: number;
  /** A JSON string: {"Cohesion_and_Coherence":{...},"Lexical_Resource":{...},...}. */
  evaluatedEssay: string;
  taskType: number;
  essayTopic: string;
  essayBody: string;
  createdAt: string;
}

export async function getEvaluationDetail(id: string): Promise<EvaluationDetail> {
  return json(await call(`/evaluations/get-evaluation-detail?id=${encodeURIComponent(id)}`));
}
