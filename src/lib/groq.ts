import Groq from "groq-sdk";
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

const MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

let client: Groq | null = null;
function getClient(): Groq {
  if (!client) {
    if (!process.env.GROQ_API_KEY) {
      throw new Error("GROQ_API_KEY is not set. Add it to .env.local and restart the server.");
    }
    client = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return client;
}

function toGroqMessages(transcript: TranscriptTurn[]): Groq.Chat.Completions.ChatCompletionMessageParam[] {
  return transcript.map((t) => ({
    role: t.role === "interviewer" ? "assistant" : "user",
    content: t.content,
  }));
}

/** Calls the chat completion API with light retry/backoff on 429 / 5xx. */
async function callGroq(
  messages: Groq.Chat.Completions.ChatCompletionMessageParam[],
  opts: { temperature: number }
): Promise<string> {
  const groq = getClient();
  const maxAttempts = 3;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const completion = await groq.chat.completions.create({
        model: MODEL,
        messages,
        temperature: opts.temperature,
        response_format: { type: "json_object" },
      });
      const content = completion.choices[0]?.message?.content;
      if (!content) throw new Error("Empty response from Groq");
      return content;
    } catch (err) {
      lastError = err;
      const status = err instanceof Groq.APIError ? err.status : undefined;
      const retryable = status === 429 || (typeof status === "number" && status >= 500);
      if (!retryable || attempt === maxAttempts - 1) break;
      const delay = 500 * 2 ** attempt;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Groq request failed");
}

/**
 * Gets the interviewer's next message + decision. `isOpening` short-circuits
 * to a dedicated opening-turn prompt (no prior candidate answer to react to).
 * Falls back to a safe, deterministic message if the model call fails or
 * returns malformed JSON, so the endpoint never 500s on the LLM being flaky.
 */
export async function getNextTurn(
  session: SessionState,
  isOpening: boolean,
  isSkip = false
): Promise<TurnDecision> {
  const system = buildSystemPrompt(session.candidate, session.plan);
  const stateBlock = isOpening ? buildOpeningStateBlock(session) : buildStateBlock(session, isSkip);

  const messages: Groq.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: system },
    ...toGroqMessages(session.transcript),
    { role: "system", content: stateBlock },
  ];

  try {
    // Higher than the feedback call's temperature on purpose — more lexical
    // variety in question phrasing so the same topic doesn't read identically
    // across different interviews. JSON-mode structure isn't affected by this.
    const raw = await callGroq(messages, { temperature: 0.75 });
    const parsed = safeParseJson<TurnDecision>(raw);
    if (parsed && isTurnDecision(parsed)) return sanitizeTurnDecision(parsed);
  } catch {
    // fall through to deterministic fallback below
  }
  return fallbackTurn(session, isOpening);
}

export async function getFeedback(
  session: SessionState,
  earlyEnd?: { endedEarly: true; unreachedTopics: string[] }
): Promise<FeedbackResult> {
  const system = buildSystemPrompt(session.candidate, session.plan);
  const messages: Groq.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: system },
    ...toGroqMessages(session.transcript),
    { role: "system", content: buildFeedbackPrompt(session, earlyEnd) },
  ];

  try {
    const raw = await callGroq(messages, { temperature: 0.4 });
    const parsed = safeParseJson<FeedbackResult>(raw);
    if (parsed && isFeedback(parsed)) return sanitizeFeedback(parsed);
  } catch {
    // fall through
  }
  return fallbackFeedback(session);
}
