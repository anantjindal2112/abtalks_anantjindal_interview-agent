import Groq from "groq-sdk";
import { DECISION_LABELS } from "./types";
import type { Assessment, CategoryScores, DecisionLabel, SessionState, TranscriptTurn } from "./types";
import {
  buildFeedbackPrompt,
  buildOpeningStateBlock,
  buildStateBlock,
  buildSystemPrompt,
} from "./prompts";

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

function safeParseJson<T>(raw: string): T | null {
  try {
    // Models sometimes wrap JSON in ```json fences despite instructions — strip defensively.
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}

export type TurnDecision = {
  action: "follow_up" | "next_topic" | "conclude";
  reply: string;
  decision?: DecisionLabel;
  reasoning?: string;
  assessment?: Assessment | null;
};

const VALID_ACTIONS = new Set(["follow_up", "next_topic", "conclude"]);

/**
 * Only `action` + `reply` are load-bearing (they drive the guardrail state
 * machine in route.ts) — validated strictly. `decision`/`reasoning`/
 * `assessment` are best-effort intelligence data riding along on the same
 * call; validated leniently (present + roughly right shape, or dropped) so a
 * model that gets those extra fields slightly wrong never breaks the
 * interview itself.
 */
function isTurnDecision(x: unknown): x is TurnDecision {
  if (!x || typeof x !== "object") return false;
  const d = x as Record<string, unknown>;
  return (
    typeof d.reply === "string" &&
    d.reply.trim().length > 0 &&
    typeof d.action === "string" &&
    VALID_ACTIONS.has(d.action)
  );
}

function sanitizeDecision(x: unknown): DecisionLabel | undefined {
  return typeof x === "string" && (DECISION_LABELS as readonly string[]).includes(x) ? (x as DecisionLabel) : undefined;
}

function sanitizeAssessment(x: unknown): Assessment | null | undefined {
  if (x === null) return null;
  if (!x || typeof x !== "object") return undefined;
  const a = x as Record<string, unknown>;
  if (typeof a.correctness !== "number" || typeof a.depth !== "number") return undefined;
  return {
    correctness: Math.max(1, Math.min(10, a.correctness)),
    depth: Math.max(1, Math.min(10, a.depth)),
    missingConcepts: Array.isArray(a.missingConcepts) ? a.missingConcepts.filter((c) => typeof c === "string") : [],
    misconception: typeof a.misconception === "string" ? a.misconception : null,
  };
}

function sanitizeTurnDecision(raw: TurnDecision): TurnDecision {
  return {
    ...raw,
    decision: sanitizeDecision(raw.decision),
    reasoning: typeof raw.reasoning === "string" ? raw.reasoning.slice(0, 300) : undefined,
    assessment: sanitizeAssessment(raw.assessment),
  };
}

/**
 * Gets the interviewer's next message + decision. `isOpening` short-circuits
 * to a dedicated opening-turn prompt (no prior candidate answer to react to).
 * Falls back to a safe, deterministic message if the model call fails or
 * returns malformed JSON, so the endpoint never 500s on the LLM being flaky.
 */
export async function getNextTurn(session: SessionState, isOpening: boolean): Promise<TurnDecision> {
  const system = buildSystemPrompt(session.candidate, session.plan);
  const stateBlock = isOpening ? buildOpeningStateBlock(session) : buildStateBlock(session);

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

  // Fallback: never break the interview flow. Advance to the next topic
  // (or conclude if none remain) with a plain, honest message.
  const topic = session.plan[session.planIndex];
  if (isOpening) {
    return {
      action: "next_topic",
      reply: `Hi ${session.candidate.member.name.split(" ")[0]}, thanks for joining. Let's start with your work on "${topic.title}" — walk me through how you approached it.`,
      decision: "SWITCH_TOPIC",
      reasoning: "Opening question (fallback path — the model call was unavailable).",
      assessment: null,
    };
  }
  const nextIndex = session.planIndex + 1;
  if (nextIndex < session.plan.length) {
    const next = session.plan[nextIndex];
    return {
      action: "next_topic",
      reply: `Thanks — let's move on. Tell me about "${next.title}": ${next.curriculumDay?.objectives?.[0] ?? "what did you build and how did it work?"}`,
      decision: "SWITCH_TOPIC",
      reasoning: "Advancing to the next topic (fallback path — the model call was unavailable, so no real assessment of the last answer).",
    };
  }
  return {
    action: "conclude",
    reply: "That covers everything I wanted to ask. Thanks for walking me through your work — your feedback is coming up now.",
    decision: "CONCLUDE",
    reasoning: "Plan exhausted (fallback path — the model call was unavailable).",
  };
}

export type FeedbackResult = {
  summary: string;
  strengths: string[];
  gaps: string[];
  next: string[];
  categoryScores?: CategoryScores;
  misconceptions?: string[];
};

// Only the four contract-required fields are validated strictly. categoryScores
// / misconceptions are best-effort extras on the same call — sanitized
// separately below, dropped (not faked) if the model gets them wrong.
function isFeedback(x: unknown): x is FeedbackResult {
  if (!x || typeof x !== "object") return false;
  const f = x as Record<string, unknown>;
  const isStrArr = (v: unknown) => Array.isArray(v) && v.every((s) => typeof s === "string");
  return typeof f.summary === "string" && isStrArr(f.strengths) && isStrArr(f.gaps) && isStrArr(f.next);
}

function sanitizeCategoryScores(x: unknown): CategoryScores | undefined {
  if (!x || typeof x !== "object") return undefined;
  const c = x as Record<string, unknown>;
  const keys: (keyof CategoryScores)[] = [
    "technicalKnowledge",
    "engineeringReasoning",
    "systemDesign",
    "communication",
    "productionAwareness",
  ];
  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
  if (!keys.every((k) => typeof c[k] === "number")) return undefined;
  return {
    technicalKnowledge: clamp(c.technicalKnowledge as number),
    engineeringReasoning: clamp(c.engineeringReasoning as number),
    systemDesign: clamp(c.systemDesign as number),
    communication: clamp(c.communication as number),
    productionAwareness: clamp(c.productionAwareness as number),
  };
}

function sanitizeFeedback(raw: FeedbackResult): FeedbackResult {
  const rawObj = raw as unknown as Record<string, unknown>;
  return {
    ...raw,
    categoryScores: sanitizeCategoryScores(rawObj.categoryScores),
    misconceptions: Array.isArray(rawObj.misconceptions)
      ? rawObj.misconceptions.filter((m): m is string => typeof m === "string").slice(0, 5)
      : undefined,
  };
}

function fallbackFeedback(session: SessionState): FeedbackResult {
  const struggled = session.plan.filter((t) => t.bucket === "struggled" || t.bucket === "failed");
  const skipped = session.plan.filter((t) => t.bucket === "skipped");
  const confident = session.plan.filter((t) => t.bucket === "confident");
  return {
    summary: `${session.candidate.member.name} completed a ${session.questionsAsked}-question interview spanning ${session.daysCovered.length} curriculum days. (Automated fallback summary — the feedback model was unavailable when this interview concluded.)`,
    strengths: confident.length
      ? confident.map((t) => `Communicated clearly on "${t.title}", a topic they passed on the first attempt during the cohort.`)
      : ["Engaged with follow-up questions throughout the interview."],
    gaps: struggled.length
      ? struggled.map((t) => `Revisit "${t.title}" — this took multiple attempts (or was not passed) during the cohort.`)
      : ["No major gaps surfaced in this session."],
    next: skipped.length
      ? skipped.map((t) => `Go back and complete "${t.title}", which was skipped during the cohort.`)
      : ["Continue practicing explaining system design decisions out loud."],
  };
}

export async function getFeedback(session: SessionState): Promise<FeedbackResult> {
  const system = buildSystemPrompt(session.candidate, session.plan);
  const messages: Groq.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: system },
    ...toGroqMessages(session.transcript),
    { role: "system", content: buildFeedbackPrompt(session) },
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
