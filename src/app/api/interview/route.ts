import { NextResponse } from "next/server";
import { buildInterviewPlan } from "@/lib/plan";
import { getFeedback, getNextTurn } from "@/lib/groq";
import { getSession, saveSession } from "@/lib/store";
import type { Candidate, InterviewResponse, PlanTopic, SessionState } from "@/lib/types";

const MIN_QUESTIONS = 8;
const MIN_DAYS = 4;
const MAX_FOLLOW_UPS_PER_TOPIC = 2;
const HARD_QUESTION_CAP = 13;

function json(body: InterviewResponse, status = 200) {
  return NextResponse.json(body, { status });
}

// --- deterministic guardrail state, recomputed fresh every turn -----------

type Guardrails = {
  isLastTopic: boolean;
  minQuestionsMet: boolean;
  minDaysMet: boolean;
  concludeAllowed: boolean;
  followUpAllowed: boolean;
  hardCapReached: boolean;
};

function computeGuardrails(session: SessionState): Guardrails {
  const isLastTopic = session.planIndex === session.plan.length - 1;
  const minQuestionsMet = session.questionsAsked >= MIN_QUESTIONS;
  const minDaysMet = session.daysCovered.length >= MIN_DAYS;
  return {
    isLastTopic,
    minQuestionsMet,
    minDaysMet,
    concludeAllowed: isLastTopic && minQuestionsMet && minDaysMet,
    followUpAllowed: session.followUpsOnCurrentTopic < MAX_FOLLOW_UPS_PER_TOPIC,
    hardCapReached: session.questionsAsked >= HARD_QUESTION_CAP,
  };
}

type ResolvedAction = "follow_up" | "next_topic" | "conclude";

/**
 * Maps the model's requested action onto the nearest action that's actually
 * allowed given the hard requirements (>=8 questions, >=4 days) and caps
 * (<=2 follow-ups/topic, <=13 questions total). This is the mechanism that
 * makes those requirements reliable regardless of what the LLM decides.
 */
function resolveAction(modelAction: ResolvedAction, g: Guardrails): { action: ResolvedAction; corrected: boolean } {
  let action = modelAction;

  if (action === "conclude" && !g.concludeAllowed) {
    action = g.isLastTopic ? (g.followUpAllowed ? "follow_up" : "next_topic") : "next_topic";
  }
  if (action === "follow_up" && !g.followUpAllowed) {
    action = "next_topic";
  }
  if (action === "next_topic" && g.isLastTopic) {
    // No more topics to advance to. If minimums aren't met yet, squeeze in
    // one more follow-up (ignoring the per-topic cap as an emergency valve —
    // hitting the contractual minimum wins over the soft cap) instead of
    // conceding it can only be a normal "no more topics" outcome.
    action = g.minQuestionsMet && g.minDaysMet ? "conclude" : "follow_up";
  }
  if (g.hardCapReached) {
    action = "conclude";
  }

  return { action, corrected: action !== modelAction };
}

function deterministicReply(action: ResolvedAction, session: SessionState): string {
  const topic = session.plan[session.planIndex];
  if (action === "follow_up") {
    return `Can you go a bit deeper on that — specifically, what made "${topic.title}" work (or not work) the way it did?`;
  }
  if (action === "conclude") {
    return "That covers everything I wanted to ask. Thanks for walking me through your work — your feedback is coming up now.";
  }
  const next = session.plan[session.planIndex + 1];
  return `Thanks — let's move on. Tell me about "${next.title}": ${
    next.curriculumDay?.objectives?.[0] ?? "what did you build and how did it work?"
  }`;
}

function topicMeta(topic: PlanTopic, isFollowUp: boolean) {
  return { day: topic.day, topicTitle: topic.title, isFollowUp };
}

// --- request handling -------------------------------------------------------

function isCandidate(x: unknown): x is Candidate {
  if (!x || typeof x !== "object") return false;
  const c = x as Record<string, unknown>;
  return !!c.member && typeof c.member === "object" && Array.isArray(c.missions);
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ reply: "Malformed JSON body.", done: false }, 400);
  }

  if (!body || typeof body !== "object") {
    return json({ reply: "Request body must be a JSON object.", done: false }, 400);
  }
  const b = body as Record<string, unknown>;
  const sessionId = typeof b.sessionId === "string" ? b.sessionId : null;
  if (!sessionId) {
    return json({ reply: "sessionId is required.", done: false }, 400);
  }

  // --- Start a new interview ---
  if ("candidate" in b) {
    if (!isCandidate(b.candidate)) {
      return json({ reply: "candidate must include member and missions.", done: false }, 400);
    }
    const candidate = b.candidate;
    const plan = buildInterviewPlan(candidate);

    const session: SessionState = {
      sessionId,
      candidate,
      plan,
      planIndex: 0,
      followUpsOnCurrentTopic: 0,
      transcript: [],
      questionsAsked: 0,
      daysCovered: [],
      phase: "warmup",
      createdAt: Date.now(),
    };

    const decision = await getNextTurn(session, true);
    const topic = plan[0];
    session.transcript.push({ role: "interviewer", content: decision.reply, meta: topicMeta(topic, false) });
    session.questionsAsked = 1;
    session.daysCovered = [topic.day];
    saveSession(session);

    return json({ reply: decision.reply, done: false });
  }

  // --- Continue an existing interview ---
  const session = getSession(sessionId);
  if (!session) {
    return json(
      { reply: "No active interview found for this sessionId. Start a new interview by sending a 'candidate' object.", done: false },
      400
    );
  }

  if (session.phase === "done") {
    return json({
      reply: "This interview has already concluded.",
      done: true,
      feedback: session.feedback ?? {
        summary: "Interview already concluded.",
        strengths: [],
        gaps: [],
        next: [],
      },
    });
  }

  const message = typeof b.message === "string" ? b.message : "";
  session.transcript.push({ role: "candidate", content: message });

  const guardrailsBefore = computeGuardrails(session);
  const decision = await getNextTurn(session, false);
  const { action, corrected } = resolveAction(decision.action, guardrailsBefore);
  const reply = corrected ? deterministicReply(action, session) : decision.reply;

  if (action === "follow_up") {
    const topic = session.plan[session.planIndex];
    session.transcript.push({ role: "interviewer", content: reply, meta: topicMeta(topic, true) });
    session.questionsAsked += 1;
    session.followUpsOnCurrentTopic += 1;
    saveSession(session);
    return json({ reply, done: false });
  }

  if (action === "next_topic") {
    session.planIndex += 1;
    const topic = session.plan[session.planIndex];
    session.transcript.push({ role: "interviewer", content: reply, meta: topicMeta(topic, false) });
    session.questionsAsked += 1;
    session.followUpsOnCurrentTopic = 0;
    if (!session.daysCovered.includes(topic.day)) session.daysCovered.push(topic.day);
    session.phase = session.planIndex === session.plan.length - 1 ? "capstone" : "core";
    saveSession(session);
    return json({ reply, done: false });
  }

  // action === "conclude"
  session.transcript.push({ role: "interviewer", content: reply });
  session.phase = "done";
  const feedback = await getFeedback(session);
  session.feedback = feedback;
  saveSession(session);

  return json({ reply, done: true, feedback });
}
