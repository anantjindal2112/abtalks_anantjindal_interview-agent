"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { MissionBucket, PlanTopic } from "@/lib/types";

export type Progress = {
  phase: string;
  planIndex: number;
  questionsAsked: number;
  daysCovered: number[];
} | null;

const BUCKET_COLOR: Record<MissionBucket, string> = {
  confident: "var(--accent)",
  struggled: "var(--warn)",
  failed: "var(--danger)",
  skipped: "var(--skip)",
};

const NODE = 10; // dot diameter in px
const COL = 20; // width of the graph-line column

export function RoadmapTrail({ plan, progress }: { plan: PlanTopic[]; progress: Progress }) {
  const reduceMotion = useReducedMotion();
  const activeIndex = progress?.planIndex ?? 0;

  return (
    <div className="p-4 flex flex-col gap-4 h-full">
      <div>
        <h3 className="mono text-[11px] uppercase tracking-wide" style={{ color: "var(--fg-dim)" }}>
          interview roadmap
        </h3>
        <p className="mono text-[11px] mt-1" style={{ color: "var(--fg-dim)" }}>
          question {progress?.questionsAsked ?? 0} · {progress?.daysCovered.length ?? 0} days covered
        </p>
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
          this whole plan was actually built from. */}
      <ol className="flex flex-col" aria-label="Interview topic plan">
        {plan.map((topic, i) => {
          const status = i < activeIndex ? "done" : i === activeIndex ? "active" : "pending";
          const isLast = i === plan.length - 1;
          const segmentDone = i < activeIndex; // line BELOW this node is "committed"
          return (
            <li key={topic.day} className="flex items-start gap-2.5">
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
              <div className="min-w-0 pb-3.5">
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
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
