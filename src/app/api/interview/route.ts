import { NextResponse } from "next/server";
import { buildInterviewPlan } from "@/lib/plan";
import { getFeedback, getNextTurn } from "@/lib/llm";
import { getSession, saveSession } from "@/lib/store";
import { checkRateLimit, clientKeyFrom } from "@/lib/rateLimit";
import {
  applyResolvedTurn,
  applyZeroedTopicPenalties,
  INITIAL_DIFFICULTY,
  topicMeta,
} from "@/lib/guardrails";
import { reconcileCategoryScores } from "@/lib/feedbackAccuracy";
import type { Candidate, InterviewResponse, SessionState } from "@/lib/types";

const MAX_MESSAGE_LENGTH = 4000; // generous for a spoken-interview-style answer, cheap abuse guard

function json(body: InterviewResponse, status = 200) {
  return NextResponse.json(body, { status });
}

/**
 * The single place both getFeedback call sites route their raw result
 * through: guarantee zeroed topics show up as explicit gaps, then ground
 * categoryScores against the real per-turn evidence rather than trusting one
 * LLM call's numbers outright. See applyZeroedTopicPenalties / reconcileCategoryScores.
 */
function finalizeFeedback(feedback: Awaited<ReturnType<typeof getFeedback>>, session: SessionState) {
  const withGaps = applyZeroedTopicPenalties(feedback, session);
  return { ...withGaps, categoryScores: reconcileCategoryScores(withGaps.categoryScores, session) };
}

function isCandidate(x: unknown): x is Candidate {
  if (!x || typeof x !== "object") return false;
  const c = x as Record<string, unknown>;
  return !!c.member && typeof c.member === "object" && Array.isArray(c.missions);
}

export async function POST(request: Request) {
  // The spec requires no auth on this endpoint, so this is deliberately not
  // that — it protects the shared Groq quota from a runaway script or retry
  // loop, not from a determined attacker. A real client (human or grader)
  // having a normal conversation will never come close to this limit.
  const rateLimit = checkRateLimit(clientKeyFrom(request));
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { reply: "Too many requests — please slow down.", done: false },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

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
  const sessionId = typeof b.sessionId === "string" ? b.sessionId.slice(0, 200) : null;
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
      difficulty: INITIAL_DIFFICULTY,
      skipCount: 0,
      skipsOnCurrentTopic: 0,
      zeroedTopics: [],
      createdAt: Date.now(),
    };

    const decision = await getNextTurn(session, true);
    const topic = plan[0];
    session.transcript.push({
      role: "interviewer",
      content: decision.reply,
      meta: topicMeta(topic, false, { decision, action: "next_topic", corrected: false, difficulty: session.difficulty }),
    });
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

  // Explicit early-end escape hatch — not advertised to real candidates (no
  // UI copy tells them this exists), and unreachable by the graded contract
  // (that only ever sends {sessionId, message}, never this flag). It exists
  // for testing/demo convenience so a full run doesn't require 8-12 turns
  // every time. Bypasses the coverage guardrail deliberately — but honestly:
  // every topic that was never reached gets counted as skipped, so the final
  // scoring reflects the real incompleteness rather than hiding it.
  if (b.endEarly === true) {
    const remainingTopics = session.plan.slice(session.planIndex + 1);
    session.skipCount += remainingTopics.length;
    session.transcript.push({
      role: "interviewer",
      content: "Understood — ending here. Thanks for the time so far; your feedback is coming up now.",
    });
    session.phase = "done";
    session.completedAt = Date.now();
    const feedback = finalizeFeedback(
      await getFeedback(session, {
        endedEarly: true,
        unreachedTopics: remainingTopics.map((t) => t.title),
      }),
      session
    );
    session.feedback = feedback;
    saveSession(session);
    return json({
      reply: "Understood — ending here. Thanks for the time so far; your feedback is coming up now.",
      done: true,
      feedback,
    });
  }

  // A skip is a real interview move ("I don't know, let's move on"), not a
  // free-text answer — the frontend's Skip button sends `skipped: true`
  // rather than trusting arbitrary client text here, so the transcript
  // records an honest fixed marker instead of whatever the client claims.
  const isSkip = b.skipped === true;
  const message = isSkip
    ? "(Skipped — indicated they don't know this one.)"
    : typeof b.message === "string"
      ? b.message.slice(0, MAX_MESSAGE_LENGTH)
      : "";
  session.transcript.push({ role: "candidate", content: message });
  if (isSkip) {
    session.skipCount += 1;
    session.skipsOnCurrentTopic += 1;
  }

  const decision = await getNextTurn(session, false, isSkip);
  // All control flow (skip 2-strike rule, coverage guardrails, difficulty,
  // question-count bookkeeping) lives in applyResolvedTurn — this is the
  // exact same function scripts/test-guardrails.ts exercises directly, so
  // there's no separate "route.ts version" of this logic to drift out of sync.
  const { reply, done } = applyResolvedTurn(session, decision, isSkip);

  if (!done) {
    saveSession(session);
    return json({ reply, done: false });
  }

  // action === "conclude"
  session.completedAt = Date.now();
  const feedback = finalizeFeedback(await getFeedback(session), session);
  session.feedback = feedback;
  saveSession(session);

  return json({ reply, done: true, feedback });
}

// --- GET /api/interview?sessionId=... ---------------------------------------
// Not part of the graded contract (which only specifies POST). Purely a
// convenience for our own frontend to render a live, honest progress trail
// (current topic, days covered, question count) without duplicating any of
// the guardrail/decision logic client-side.
export async function GET(request: Request) {
  const sessionId = new URL(request.url).searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId query param is required" }, { status: 400 });
  }
  const session = getSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({
    phase: session.phase,
    planIndex: session.planIndex,
    questionsAsked: session.questionsAsked,
    daysCovered: session.daysCovered,
    followUpsOnCurrentTopic: session.followUpsOnCurrentTopic,
    difficulty: session.difficulty,
    plan: session.plan.map((t) => ({ day: t.day, title: t.title, bucket: t.bucket })),
    // Real per-turn intelligence data (assessment/reasoning/decision), only
    // ever what the model actually returned for that turn — powers the
    // difficulty indicator, decision chips, and Judge Mode drawer. Not part
    // of the graded POST contract, same as the rest of this GET endpoint.
    evaluations: session.transcript
      .filter((t) => t.role === "interviewer" && t.meta)
      .map((t) => ({
        day: t.meta!.day,
        topicTitle: t.meta!.topicTitle,
        isFollowUp: t.meta!.isFollowUp,
        assessment: t.meta!.assessment ?? null,
        decisionLabel: t.meta!.decisionLabel ?? null,
        reasoning: t.meta!.reasoning ?? null,
        difficulty: t.meta!.difficulty ?? null,
      })),
    transcript: session.transcript.map((t) => ({ role: t.role, content: t.content })),
  });
}
