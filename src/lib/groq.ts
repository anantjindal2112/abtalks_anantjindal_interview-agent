import Groq from "groq-sdk";
import type { SessionState, TranscriptTurn } from "./types";
import { buildFeedbackPrompt, buildOpeningStateBlock, buildStateBlock, buildSystemPrompt } from "./prompts";
import {
  fallbackFeedback,
  fallbackTurn,
  isFeedback,
  isTurnDecision,
  recentTranscript,
  safeParseJson,
  sanitizeFeedback,
  sanitizeTurnDecision,
} from "./llm-shared";
import type { FeedbackResult, TurnDecision } from "./llm-shared";

export type { TurnDecision, FeedbackResult };

const MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

type KeyedClient = { client: Groq; label: string };

// Groq's real free-tier ceiling for openai/gpt-oss-120b is a 200k
// tokens/DAY cap (not just the 8k/minute one) — good for roughly 8-10 full
// interviews on a single key before every call 429s. If GROQ_API_KEY_BACKUP
// is set, callGroq() automatically fails over to it once the primary key's
// own retries are exhausted, which roughly doubles real demo-day capacity
// before anyone ever sees the generic scripted fallback.
let clients: KeyedClient[] | null = null;
function getClients(): KeyedClient[] {
  if (!clients) {
    const primary = process.env.GROQ_API_KEY;
    if (!primary) {
      throw new Error("GROQ_API_KEY is not set. Add it to .env.local and restart the server.");
    }
    clients = [{ client: new Groq({ apiKey: primary }), label: "primary" }];
    const backup = process.env.GROQ_API_KEY_BACKUP;
    if (backup) clients.push({ client: new Groq({ apiKey: backup }), label: "backup" });
  }
  return clients;
}

function toGroqMessages(transcript: TranscriptTurn[]): Groq.Chat.Completions.ChatCompletionMessageParam[] {
  return transcript.map((t) => ({
    role: t.role === "interviewer" ? "assistant" : "user",
    content: t.content,
  }));
}

/**
 * Calls the chat completion API with retry/backoff on 429/5xx, then — if a
 * backup key is configured — fails over to it and retries again before
 * finally giving up (which falls through to the deterministic fallback in
 * getNextTurn/getFeedback below, unchanged).
 */
async function callGroq(
  messages: Groq.Chat.Completions.ChatCompletionMessageParam[],
  opts: { temperature: number }
): Promise<string> {
  const allClients = getClients();
  const maxAttempts = 3;
  let lastError: unknown;

  for (let clientIndex = 0; clientIndex < allClients.length; clientIndex++) {
    const { client: groq, label } = allClients[clientIndex];
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
    if (clientIndex < allClients.length - 1) {
      console.error(`[groq] ${label} key exhausted its retries, failing over to backup key:`, lastError);
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
    ...toGroqMessages(recentTranscript(session.transcript)),
    { role: "system", content: stateBlock },
  ];

  try {
    // Higher than the feedback call's temperature on purpose — more lexical
    // variety in question phrasing so the same topic doesn't read identically
    // across different interviews. JSON-mode structure isn't affected by this.
    const raw = await callGroq(messages, { temperature: 0.75 });
    const parsed = safeParseJson<TurnDecision>(raw);
    if (parsed && isTurnDecision(parsed)) return sanitizeTurnDecision(parsed);
    console.error("[groq] getNextTurn: response failed shape/parse check, falling back:", raw);
  } catch (err) {
    console.error("[groq] getNextTurn: call failed, falling back:", err);
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
    console.error("[groq] getFeedback: response failed shape/parse check, falling back:", raw);
  } catch (err) {
    console.error("[groq] getFeedback: call failed, falling back:", err);
  }
  return fallbackFeedback(session);
}
