import { GoogleGenAI, ApiError } from "@google/genai";
import type { SessionState, TranscriptTurn } from "./types";
import { buildFeedbackPrompt, buildOpeningStateBlock, buildStateBlock, buildSystemPrompt } from "./prompts";
import {
  fallbackFeedback,
  fallbackTurn,
  isFeedback,
  isTurnDecision,
  safeParseJson,
  sanitizeFeedback,
  sanitizeTurnDecision,
} from "./llm-shared";
import type { FeedbackResult, TurnDecision } from "./llm-shared";

export type { TurnDecision, FeedbackResult };

// Parallel implementation to groq.ts — identical exported interface
// (getNextTurn/getFeedback), same shared validation/fallback logic from
// llm-shared.ts, swappable via LLM_PROVIDER without route.ts knowing or
// caring which provider is actually answering.
const MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";

let client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  if (!client) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not set. Add it to .env.local and restart the server.");
    }
    client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return client;
}

type GeminiContent = { role: "user" | "model"; parts: [{ text: string }] };

function toGeminiContents(transcript: TranscriptTurn[]): GeminiContent[] {
  return transcript.map((t) => ({
    role: t.role === "interviewer" ? "model" : "user",
    parts: [{ text: t.content }],
  }));
}

/** Calls generateContent with light retry/backoff on 429 / 5xx — same policy as callGroq. */
async function callGemini(
  systemInstruction: string,
  contents: GeminiContent[],
  opts: { temperature: number }
): Promise<string> {
  const ai = getClient();
  const maxAttempts = 3;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: MODEL,
        contents,
        config: {
          systemInstruction,
          temperature: opts.temperature,
          responseMimeType: "application/json",
        },
      });
      const text = response.text;
      if (!text) throw new Error("Empty response from Gemini");
      return text;
    } catch (err) {
      lastError = err;
      const status = err instanceof ApiError ? err.status : undefined;
      const retryable = status === 429 || (typeof status === "number" && status >= 500);
      if (!retryable || attempt === maxAttempts - 1) break;
      const delay = 500 * 2 ** attempt;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Gemini request failed");
}

export async function getNextTurn(
  session: SessionState,
  isOpening: boolean,
  isSkip = false
): Promise<TurnDecision> {
  const system = buildSystemPrompt(session.candidate, session.plan);
  const stateBlock = isOpening ? buildOpeningStateBlock(session) : buildStateBlock(session, isSkip);
  // Gemini's `contents` array can't be empty on the very first turn (no
  // transcript yet) — fold the state block into a single trailing user turn
  // either way, same as appending a final system message in the Groq path.
  const contents: GeminiContent[] = [
    ...toGeminiContents(session.transcript),
    { role: "user", parts: [{ text: stateBlock }] },
  ];

  try {
    const raw = await callGemini(system, contents, { temperature: 0.75 });
    const parsed = safeParseJson<TurnDecision>(raw);
    if (parsed && isTurnDecision(parsed)) return sanitizeTurnDecision(parsed);
    console.error("[gemini] getNextTurn: response failed shape/parse check, falling back:", raw);
  } catch (err) {
    console.error("[gemini] getNextTurn: call failed, falling back:", err);
  }
  return fallbackTurn(session, isOpening);
}

export async function getFeedback(
  session: SessionState,
  earlyEnd?: { endedEarly: true; unreachedTopics: string[] }
): Promise<FeedbackResult> {
  const system = buildSystemPrompt(session.candidate, session.plan);
  const contents: GeminiContent[] = [
    ...toGeminiContents(session.transcript),
    { role: "user", parts: [{ text: buildFeedbackPrompt(session, earlyEnd) }] },
  ];

  try {
    const raw = await callGemini(system, contents, { temperature: 0.4 });
    const parsed = safeParseJson<FeedbackResult>(raw);
    if (parsed && isFeedback(parsed)) return sanitizeFeedback(parsed);
    console.error("[gemini] getFeedback: response failed shape/parse check, falling back:", raw);
  } catch (err) {
    console.error("[gemini] getFeedback: call failed, falling back:", err);
  }
  return fallbackFeedback(session);
}
