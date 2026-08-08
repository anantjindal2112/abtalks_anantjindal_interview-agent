// Single switchboard for which LLM provider actually answers the interview.
// route.ts imports only from here, never from groq.ts/gemini.ts directly —
// swapping providers (or adding a third) never touches interview logic.
// Defaults to Groq (the one that's been live-tested all session); set
// LLM_PROVIDER=gemini in .env.local to switch.
import * as groq from "./groq";
import * as gemini from "./gemini";

const provider = process.env.LLM_PROVIDER === "gemini" ? gemini : groq;

export const getNextTurn = provider.getNextTurn;
export const getFeedback = provider.getFeedback;
export type { TurnDecision, FeedbackResult } from "./groq";
