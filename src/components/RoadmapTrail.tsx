"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { Assessment, DecisionLabel, MissionBucket, PlanTopic } from "@/lib/types";

export type TurnEvaluation = {
  day: number;
  topicTitle: string;
  isFollowUp: boolean;
  assessment: Assessment | null;
  decisionLabel: DecisionLabel | null;
  reasoning: string | null;
  difficulty: number | null;
};

export type Progress = {
  phase: string;
  planIndex: number;
  questionsAsked: number;
  daysCovered: number[];
  difficulty?: number;
  evaluations?: TurnEvaluation[];
} | null;

const BUCKET_COLOR: Record<MissionBucket, string> = {
  confident: "var(--accent)",
  struggled: "var(--warn)",
  failed: "var(--danger)",
  skipped: "var(--skip)",
};

const NODE = 10; // dot diameter in px
const COL = 20; // width of the graph-line column

/**
 * The difficulty dots, PLUS a one-shot "log tag" flash (e.g. `↑ DIFFICULTY
 * 3`) the moment the level actually changes — mirrors a terminal log line
 * briefly appearing then settling, rather than a silent dot-fill change
 * that's easy to miss live.
 */
export function DifficultyIndicator({ level }: { level: number }) {
  const reduceMotion = useReducedMotion();
  const prevLevel = useRef(level);
  const [flash, setFlash] = useState<{ level: number; up: boolean } | null>(null);

  useEffect(() => {
    if (level !== prevLevel.current) {
      const up = level > prevLevel.current;
      prevLevel.current = level;
      setFlash({ level, up });
      const id = setTimeout(() => setFlash(null), 1600);
      return () => clearTimeout(id);
    }
  }, [level]);

  return (
    <div className="flex items-center gap-2 relative">
      <span className="mono text-[10px] uppercase tracking-wide" style={{ color: "var(--fg-dim)" }}>
        difficulty
      </span>
      <span className="flex gap-1" role="img" aria-label={`Difficulty level ${level} of 5`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <motion.span
            key={n}
            className="size-2 rounded-full"
            style={{ background: n <= level ? "var(--accent-2)" : "var(--bg-inset)", border: "1px solid var(--border)" }}
            initial={false}
            animate={{ scale: n === level && !reduceMotion ? [1, 1.3, 1] : 1 }}
            transition={{ duration: 0.35 }}
          />
        ))}
      </span>
      <AnimatePresence>
        {flash && (
          <motion.span
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -4, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="mono text-[9px] rounded px-1.5 py-0.5 absolute left-full ml-1.5 whitespace-nowrap"
            style={{
              background: flash.up ? "var(--warn)" : "var(--accent-2)",
              color: "var(--accent-fg)",
            }}
          >
            {flash.up ? "↑" : "↓"} DIFFICULTY {flash.level}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

function GitShowTooltip({ day, evaluation }: { day: number; evaluation: TurnEvaluation | undefined }) {
  return (
    <div
      role="tooltip"
      className="absolute left-full ml-2 top-0 z-20 w-56 rounded-md border p-2.5 mono text-[10px] leading-relaxed pointer-events-none"
      style={{ borderColor: "var(--border)", background: "var(--bg-elevated)", boxShadow: "var(--shadow)" }}
    >
      <div style={{ color: "var(--accent-2)" }}>$ git show day:{day}</div>
      {evaluation ? (
        <div className="mt-1 flex flex-col gap-0.5" style={{ color: "var(--fg-dim)" }}>
          {evaluation.decisionLabel && <div>decision {evaluation.decisionLabel}</div>}
          {evaluation.assessment && (
            <div>
              correctness {evaluation.assessment.correctness}/10 · depth {evaluation.assessment.depth}/10
            </div>
          )}
          {evaluation.assessment?.misconception && (
            <div style={{ color: "var(--danger)" }}>⚠ {evaluation.assessment.misconception}</div>
          )}
        </div>
      ) : (
        <div className="mt-1" style={{ color: "var(--fg-dim)" }}>
          not reached yet — nothing to show
        </div>
      )}
    </div>
  );
}

export function RoadmapTrail({ plan, progress }: { plan: PlanTopic[]; progress: Progress }) {
  const reduceMotion = useReducedMotion();
  const activeIndex = progress?.planIndex ?? 0;
  const prevActiveIndex = useRef(activeIndex);
  const [justCommitted, setJustCommitted] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);

  // Fires a one-shot "$ git commit" line next to whichever node just
  // finished, the moment the plan actually advances — real state, not a
  // decorative loop.
  useEffect(() => {
    if (activeIndex > prevActiveIndex.current) {
      const finishedIndex = prevActiveIndex.current;
      prevActiveIndex.current = activeIndex;
      setJustCommitted(finishedIndex);
      const id = setTimeout(() => setJustCommitted(null), 2200);
      return () => clearTimeout(id);
    }
    prevActiveIndex.current = activeIndex;
  }, [activeIndex]);

  const evaluationsByDay = new Map((progress?.evaluations ?? []).map((e) => [e.day, e]));

  return (
    <div className="p-4 flex flex-col gap-4 h-full">
      <div>
        <h3 className="mono text-[11px] uppercase tracking-wide" style={{ color: "var(--fg-dim)" }}>
          interview roadmap
        </h3>
        <p className="mono text-[11px] mt-1" style={{ color: "var(--fg-dim)" }}>
          question {progress?.questionsAsked ?? 0} · {progress?.daysCovered.length ?? 0} days covered
        </p>
        {typeof progress?.difficulty === "number" && (
          <div className="mt-2">
            <DifficultyIndicator level={progress.difficulty} />
          </div>
        )}
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full" style={{ background: "var(--bg-inset)" }}>
          <motion.div
            className="h-full rounded-full"
            style={{ background: "var(--accent)" }}
            initial={false}
            animate={{ width: `${plan.length ? (activeIndex / Math.max(1, plan.length - 1)) * 100 : 0}%` }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.4 }}
          />
        </div>
      </div>

      {/* Git-graph style: a branch line runs down the left, commit nodes sit
          on it, and the line segment below each completed node solidifies
          in the topic's outcome color — a small nod to the "commit history"
          this whole plan was actually built from. Hover a node for a
          `git show` of that day's real assessment; the node a topic just
          finished on briefly shows the actual `git commit` line. */}
      <ol className="flex flex-col" aria-label="Interview topic plan">
        {plan.map((topic, i) => {
          const status = i < activeIndex ? "done" : i === activeIndex ? "active" : "pending";
          const isLast = i === plan.length - 1;
          const segmentDone = i < activeIndex; // line BELOW this node is "committed"
          const shortTitle = topic.title.length > 28 ? `${topic.title.slice(0, 28)}…` : topic.title;
          return (
            <li
              key={topic.day}
              className="flex items-start gap-2.5 relative"
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered((h) => (h === i ? null : h))}
            >
              <span className="relative flex flex-col items-center shrink-0" style={{ width: COL }}>
                <span className="relative flex items-center justify-center" style={{ width: COL, height: NODE + 6 }}>
                  {status === "active" && !reduceMotion && (
                    <motion.span
                      className="absolute rounded-full"
                      style={{ width: NODE, height: NODE, background: BUCKET_COLOR[topic.bucket], opacity: 0.35 }}
                      animate={{ scale: [1, 2], opacity: [0.4, 0] }}
                      transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
                    />
                  )}
                  <span
                    className="rounded-full border-2 z-10"
                    style={{
                      width: NODE,
                      height: NODE,
                      background: status === "pending" ? "var(--bg-elevated)" : BUCKET_COLOR[topic.bucket],
                      borderColor: BUCKET_COLOR[topic.bucket],
                    }}
                  />
                </span>
                {!isLast && (
                  <span className="relative flex-1 w-px min-h-[22px]" style={{ background: "var(--border)" }}>
                    <motion.span
                      className="absolute inset-x-0 top-0 w-px"
                      style={{ background: BUCKET_COLOR[topic.bucket] }}
                      initial={false}
                      animate={{ height: segmentDone ? "100%" : "0%" }}
                      transition={reduceMotion ? { duration: 0 } : { duration: 0.35 }}
                    />
                  </span>
                )}
              </span>
              <div className="min-w-0 pb-3.5 relative">
                <div
                  className="text-xs leading-snug truncate"
                  style={{
                    color: status === "pending" ? "var(--fg-dim)" : "var(--fg)",
                    fontWeight: status === "active" ? 600 : 400,
                  }}
                  title={topic.title}
                >
                  {topic.title}
                </div>
                <div className="mono text-[10px]" style={{ color: "var(--fg-dim)" }}>
                  day {topic.day} · {topic.bucket}
                </div>

                <AnimatePresence>
                  {justCommitted === i && (
                    <motion.div
                      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="mono text-[10px] mt-0.5"
                      style={{ color: "var(--accent)" }}
                    >
                      $ git commit -m &quot;day {topic.day}: {shortTitle}&quot;
                    </motion.div>
                  )}
                </AnimatePresence>

                {hovered === i && <GitShowTooltip day={topic.day} evaluation={evaluationsByDay.get(topic.day)} />}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
