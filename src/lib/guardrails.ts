// Pure, deterministic interview control-flow logic — the actual guardrail
// engine that route.ts runs on every turn. Extracted out of route.ts so it
// can be unit-tested directly (scripts/test-guardrails.ts) without touching
// Next.js, HTTP, or the LLM at all: every function here takes plain data in
// and returns plain data out, no network calls, no globals.
import type { Assessment, DecisionLabel, PlanTopic, SessionState } from "./types";
import type { TurnDecision } from "./llm-shared";

export const MIN_QUESTIONS = 8;
export const MIN_DAYS = 4;
export const MAX_FOLLOW_UPS_PER_TOPIC = 2;
export const MAX_SKIPS_PER_TOPIC = 2; // 1st/2nd skip on a topic: stay and ask something else. 3rd: abandon it and zero it.
export const HARD_QUESTION_CAP = 12;
export const INITIAL_DIFFICULTY = 2; // 1-5 scale, start slightly below middle and ramp with evidence

/**
 * Deterministic difficulty adjustment from the model's own assessment of the
 * answer that just happened — not a second opinion, not model-reported, just
 * a bounded (1-5) derivation of the same correctness/depth numbers already
 * being validated elsewhere. Absent assessment (e.g. opening turn) leaves it
 * unchanged.
 */
export function updateDifficulty(current: number, assessment: Assessment | null | undefined): number {
  if (!assessment) return current;
  const avg = (assessment.correctness + assessment.depth) / 2;
  const delta = avg >= 8 ? 1 : avg <= 4 ? -1 : 0;
  return Math.max(1, Math.min(5, current + delta));
}

// --- deterministic guardrail state, recomputed fresh every turn -----------

export type Guardrails = {
  isLastTopic: boolean;
  minQuestionsMet: boolean;
  minDaysMet: boolean;
  concludeAllowed: boolean;
  followUpAllowed: boolean;
  hardCapReached: boolean;
};

export function computeGuardrails(session: SessionState): Guardrails {
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

export type ResolvedAction = "follow_up" | "next_topic" | "conclude";

/**
 * Maps the model's requested action onto the nearest action that's actually
 * allowed given the hard requirements (>=8 questions, >=4 days) and caps
 * (<=2 follow-ups/topic, <=12 questions total). This is the mechanism that
 * makes those requirements reliable regardless of what the LLM decides.
 */
export function resolveAction(modelAction: ResolvedAction, g: Guardrails): { action: ResolvedAction; corrected: boolean } {
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

export function deterministicReply(action: ResolvedAction, session: SessionState, opts?: { skipRetry?: boolean }): string {
  const topic = session.plan[session.planIndex];
  if (action === "follow_up") {
    if (opts?.skipRetry) {
      // A skip retry needs a genuinely different question, not "go deeper" —
      // there's nothing to deepen when they said they don't know it. Reach
      // for a different curriculum objective than the (unknown, since this
      // is the code fallback path) one already asked, to reduce the odds of
      // repeating the exact same question.
      const objectives = topic.curriculumDay?.objectives ?? [];
      const alt = objectives[1] ?? objectives[0];
      return `No worries — let's come at "${topic.title}" from another angle: ${
        alt ?? "what would you say is the core idea here, in your own words?"
      }`;
    }
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

function fallbackDecisionLabel(action: ResolvedAction): DecisionLabel {
  if (action === "follow_up") return "DEEPEN";
  if (action === "next_topic") return "SWITCH_TOPIC";
  return "CONCLUDE";
}

export function topicMeta(
  topic: PlanTopic,
  isFollowUp: boolean,
  extra: { decision: TurnDecision; action: ResolvedAction; corrected: boolean; difficulty: number }
) {
  const { decision, action, corrected, difficulty } = extra;
  return {
    day: topic.day,
    topicTitle: topic.title,
    isFollowUp,
    assessment: decision.assessment ?? undefined,
    difficulty,
    // If the guardrail overrode the model's action, its own decision/reasoning
    // no longer describes what actually happened — show an honest override
    // note instead of a mismatched narrative (e.g. model said CONCLUDE, code
    // forced follow_up to hit the coverage minimum).
    decisionLabel: corrected ? fallbackDecisionLabel(action) : decision.decision,
    reasoning: corrected
      ? "Coverage guardrail: continuing until the minimum question/day requirements are met, regardless of the model's preference here."
      : decision.reasoning,
  };
}

export type ResolveTurnResult = {
  action: ResolvedAction;
  corrected: boolean;
  isSkipRetry: boolean;
  zeroedTopic: { day: number; title: string } | null; // non-null exactly when this turn abandons a topic via a 3rd+ skip
};

/**
 * The full control-flow decision for one turn: skip 2-strike handling PLUS
 * the coverage guardrails, composed exactly the way route.ts needs them
 * composed. Pure — takes the model's decision and a session snapshot, returns
 * what should happen; does not mutate anything.
 */
export function resolveTurnAction(decision: TurnDecision, session: SessionState, isSkip: boolean): ResolveTurnResult {
  const guardrailsBefore = computeGuardrails(session);

  // Skip control flow is a hard, code-enforced 2-strike rule — never left to
  // the model. 1st/2nd skip on a topic: stay on it and ask something else
  // (never advance). 3rd+ skip: the candidate has had their chances, abandon
  // the topic and guarantee it a zero in the final feedback.
  let modelAction: ResolvedAction = decision.action;
  let zeroedTopic: { day: number; title: string } | null = null;
  // Only true for a genuine "1st/2nd skip, stay and ask something else" —
  // NOT for the case below where the coverage emergency valve forces one
  // more question back onto an already-abandoned LAST topic (no other topic
  // exists to move to). That forced question is real and MUST increment
  // questionsAsked like any other — otherwise, on an all-skip run through the
  // last topic, the count could never reach MIN_QUESTIONS and the interview
  // would never conclude (caught by scripts/test-guardrails.ts).
  let skipRetryIntent = false;
  if (isSkip) {
    if (session.skipsOnCurrentTopic > MAX_SKIPS_PER_TOPIC) {
      modelAction = "next_topic";
      const topic = session.plan[session.planIndex];
      // Guard against double-recording: on the last topic, the coverage
      // emergency valve below can force this straight back to "follow_up" on
      // the SAME already-zeroed topic (no next topic to move to), so a 4th,
      // 5th, ... skip on it would otherwise re-flag it every time.
      const alreadyZeroed = session.zeroedTopics.some((z) => z.day === topic.day);
      if (!alreadyZeroed) {
        zeroedTopic = { day: topic.day, title: topic.title };
      }
    } else {
      modelAction = "follow_up";
      skipRetryIntent = true;
    }
  }
  // A genuine skip retry has its own dedicated 2-strike budget above — never
  // let the general per-topic follow-up cap (meant for deepening real
  // answers) cut one short.
  const guardrailsForResolve = skipRetryIntent ? { ...guardrailsBefore, followUpAllowed: true } : guardrailsBefore;
  const { action, corrected: guardrailCorrected } = resolveAction(modelAction, guardrailsForResolve);
  // "corrected" (used to decide model-reply vs. deterministic fallback text)
  // must account for the skip override above too, not just resolveAction's
  // own correction — the model's `reply` was generated for whatever action IT
  // returned, which may differ from what we're actually doing.
  const corrected = guardrailCorrected || action !== decision.action;
  const isSkipRetry = skipRetryIntent && action === "follow_up";

  return { action, corrected, isSkipRetry, zeroedTopic };
}

/**
 * Applies one resolved turn to a session IN PLACE — the single mutation path
 * route.ts and the test harness both go through, so a test that exercises
 * this function is exercising the exact same code the live API runs, not a
 * re-implementation that could silently drift from it.
 */
export function applyResolvedTurn(
  session: SessionState,
  decision: TurnDecision,
  isSkip: boolean
): { reply: string; action: ResolvedAction; done: boolean } {
  const { action, corrected, isSkipRetry, zeroedTopic } = resolveTurnAction(decision, session, isSkip);
  if (zeroedTopic) session.zeroedTopics.push(zeroedTopic);
  const reply = corrected ? deterministicReply(action, session, { skipRetry: isSkipRetry }) : decision.reply;

  session.difficulty = updateDifficulty(session.difficulty, decision.assessment);
  // Guaranteed consequence for repeated skipping — a code-enforced floor, not
  // just hoping the model's assessment naturally scores it low enough.
  if (isSkip && session.skipCount >= 2) {
    session.difficulty = Math.max(1, session.difficulty - 1);
  }
  const metaExtra = { decision, action, corrected, difficulty: session.difficulty };

  if (action === "follow_up") {
    const topic = session.plan[session.planIndex];
    session.transcript.push({ role: "interviewer", content: reply, meta: topicMeta(topic, true, metaExtra) });
    // A skip retry REPLACES the question the candidate skipped — it doesn't
    // book a new slot, so the total question count stays put. Only a real
    // deepening follow-up (an actual answer that warranted going further)
    // counts as an additional question.
    if (!isSkipRetry) {
      session.questionsAsked += 1;
    }
    session.followUpsOnCurrentTopic += 1;
    return { reply, action, done: false };
  }

  if (action === "next_topic") {
    session.planIndex += 1;
    const topic = session.plan[session.planIndex];
    session.transcript.push({ role: "interviewer", content: reply, meta: topicMeta(topic, false, metaExtra) });
    session.questionsAsked += 1;
    session.followUpsOnCurrentTopic = 0;
    session.skipsOnCurrentTopic = 0;
    if (!session.daysCovered.includes(topic.day)) session.daysCovered.push(topic.day);
    session.phase = session.planIndex === session.plan.length - 1 ? "capstone" : "core";
    return { reply, action, done: false };
  }

  // action === "conclude"
  session.transcript.push({ role: "interviewer", content: reply });
  session.phase = "done";
  return { reply, action, done: true };
}

/**
 * Guarantees every topic abandoned after 3+ skips shows up as an explicit,
 * unmissable zero in the final feedback — a code-enforced floor, same
 * principle as the rest of this file, rather than trusting the model to have
 * actually followed the feedback prompt's instruction. Only appends a gap
 * line for a topic the model didn't already mention (cheap substring check
 * on the title) so a model that DID comply doesn't get a duplicate.
 */
export function applyZeroedTopicPenalties<T extends { gaps: string[] }>(feedback: T, session: SessionState): T {
  if (session.zeroedTopics.length === 0) return feedback;
  const gaps = [...feedback.gaps];
  for (const t of session.zeroedTopics) {
    const alreadyMentioned = gaps.some((g) => g.toLowerCase().includes(t.title.toLowerCase()));
    if (!alreadyMentioned) {
      gaps.push(`Day ${t.day} — "${t.title}": skipped 3 times without attempting an answer — scored 0, a confirmed gap.`);
    }
  }
  return { ...feedback, gaps };
}
