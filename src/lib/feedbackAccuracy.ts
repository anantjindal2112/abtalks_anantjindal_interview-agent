// Grounds the feedback call's category scores against real, already-collected
// per-turn evidence instead of trusting a single LLM call's numbers outright.
// Deliberately NOT a second LLM call (stays free-tier-friendly and doesn't
// burn extra Groq/Gemini budget) — every turn already carries a real
// assessment (correctness/depth 1-10) from the SAME per-turn call that drives
// the interview itself, so this is just arithmetic over data that already
// exists, following the same "never let one model call's word be the only
// safeguard" philosophy as the coverage guardrails in guardrails.ts.
import type { CategoryScores, SessionState } from "./types";

const CATEGORY_KEYS: (keyof CategoryScores)[] = [
  "technicalKnowledge",
  "engineeringReasoning",
  "systemDesign",
  "communication",
  "productionAwareness",
];

// How much weight the LLM's own per-category judgment keeps vs. the
// objective per-turn signal it gets pulled toward. The LLM sees nuance
// (which category a given answer actually spoke to) the objective signal
// can't — this isn't meant to override it, just to stop a single confident
// but wrong category score from standing unchecked.
const LLM_WEIGHT = 0.7;
const OBJECTIVE_WEIGHT = 1 - LLM_WEIGHT;

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * A single 0-100 "how did this interview objectively go" signal, averaged
 * from every turn's real assessment (correctness+depth)/2 * 10 — including
 * skip turns, which the prompt contract already requires scoring low (1-2),
 * so heavy skipping naturally pulls this down without double-penalizing it
 * here. Returns null if there's no real assessment data to work from (e.g.
 * every turn hit the deterministic fallback path), in which case there's
 * nothing honest to blend against.
 */
export function computeObjectiveScoreSignal(session: SessionState): number | null {
  const scores = session.transcript
    .filter((t) => t.role === "interviewer" && t.meta?.assessment)
    .map((t) => ((t.meta!.assessment!.correctness + t.meta!.assessment!.depth) / 2) * 10);
  if (scores.length === 0) return null;
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return clamp(avg);
}

/**
 * Reconciles categoryScores against the objective signal:
 * - If the model returned scores, blend each one toward the objective signal
 *   (70/30) rather than trusting a single call's numbers outright — catches
 *   e.g. a confidently-inflated systemDesign score after a shaky interview.
 * - If the model omitted categoryScores entirely, deterministically fill
 *   every category with the objective signal rather than leaving the field
 *   blank — every completed interview gets real scores, never "no data".
 * - If there's no objective signal to work from either (fallback path, no
 *   real assessments collected), returns whatever the model gave as-is.
 */
export function reconcileCategoryScores(
  llmScores: CategoryScores | undefined,
  session: SessionState
): CategoryScores | undefined {
  const objective = computeObjectiveScoreSignal(session);
  if (objective === null) return llmScores;

  if (!llmScores) {
    // No model scores at all — deterministic fallback beats an empty field.
    const filled = {} as CategoryScores;
    for (const key of CATEGORY_KEYS) filled[key] = objective;
    return filled;
  }

  const blended = {} as CategoryScores;
  for (const key of CATEGORY_KEYS) {
    blended[key] = clamp(llmScores[key] * LLM_WEIGHT + objective * OBJECTIVE_WEIGHT);
  }
  return blended;
}
