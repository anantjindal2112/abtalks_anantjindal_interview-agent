"use client";

import { motion, useReducedMotion, AnimatePresence } from "framer-motion";
import { DURATION, EASE_OUT } from "@/lib/motion";
import type { TurnEvaluation } from "./RoadmapTrail";

const DECISION_COPY: Record<string, string> = {
  DEEPEN: "Answer was solid but shallow — going one level deeper on the same idea.",
  CHALLENGE: "Answer was correct and complete — pushing with a harder edge case.",
  CLARIFY: "Answer was vague or ambiguous — asking for something concrete.",
  VERIFY_MISCONCEPTION: "Suspected a specific wrong mental model — probing to confirm or refute it.",
  SWITCH_TOPIC: "Moving to the next planned topic.",
  CONCLUDE: "Wrapping up the interview.",
};

/**
 * "Why did the agent ask this?" — every entry here is data the model
 * actually returned for that exact turn (see route.ts: assessment/decision/
 * reasoning ride along on the same single per-turn call, sanitized, never
 * fabricated). If a turn has no reasoning (e.g. the guardrail overrode the
 * model's action), that's shown honestly too, not papered over.
 */
export function JudgeMode({ evaluations, open }: { evaluations: TurnEvaluation[]; open: boolean }) {
  const reduceMotion = useReducedMotion();

  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          initial={reduceMotion ? false : { height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={reduceMotion ? undefined : { height: 0, opacity: 0 }}
          transition={{ duration: DURATION.panel, ease: EASE_OUT }}
          className="overflow-hidden rounded-xl border mt-4"
          style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}
        >
          <div className="p-4 sm:p-5">
            <h3 className="mono text-[11px] uppercase tracking-wide" style={{ color: "var(--accent-2)" }}>
              interview intelligence — why each question was asked
            </h3>
            <p className="mt-1 text-xs" style={{ color: "var(--fg-dim)" }}>
              Real decisions from the interview agent, not a script — one entry per question, in order.
            </p>

            <ol className="mt-4 flex flex-col">
              {evaluations.map((e, i) => {
                const isLast = i === evaluations.length - 1;
                return (
                  <li key={i} className="flex items-start gap-3">
                    <span className="relative flex flex-col items-center shrink-0" style={{ width: 16 }}>
                      <span
                        className="size-2.5 rounded-full border-2 shrink-0"
                        style={{
                          borderColor: e.assessment?.misconception ? "var(--danger)" : "var(--accent-2)",
                          background: isLast ? "var(--accent-2)" : "var(--bg-elevated)",
                        }}
                      />
                      {!isLast && <span className="flex-1 w-px min-h-[28px]" style={{ background: "var(--border)" }} />}
                    </span>
                    <div className="min-w-0 pb-4 flex-1">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="mono text-xs font-medium" style={{ color: "var(--fg)" }}>
                          Q{i + 1} · {e.topicTitle} {e.isFollowUp && "(follow-up)"}
                        </span>
                        {e.decisionLabel && (
                          <span className="mono text-[10px] rounded-full border px-1.5 py-0.5" style={{ borderColor: "var(--accent-2)", color: "var(--accent-2)" }}>
                            {e.decisionLabel}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--fg-dim)" }}>
                        {e.reasoning ?? (e.decisionLabel ? DECISION_COPY[e.decisionLabel] : "No reasoning recorded for this turn.")}
                      </p>
                      {e.assessment && (
                        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 mono text-[10px]" style={{ color: "var(--fg-dim)" }}>
                          <span>correctness {e.assessment.correctness}/10</span>
                          <span>depth {e.assessment.depth}/10</span>
                          {e.assessment.missingConcepts.length > 0 && (
                            <span>missing: {e.assessment.missingConcepts.join(", ")}</span>
                          )}
                        </div>
                      )}
                      {e.assessment?.misconception && (
                        <div
                          className="mt-1.5 text-[11px] rounded-md border px-2 py-1"
                          style={{ borderColor: "var(--danger)", color: "var(--fg)", background: "var(--bg-inset)" }}
                        >
                          ⚠ misconception: {e.assessment.misconception}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
