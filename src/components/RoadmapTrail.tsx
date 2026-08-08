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

      <ol className="flex flex-col gap-1" aria-label="Interview topic plan">
        {plan.map((topic, i) => {
          const status = i < activeIndex ? "done" : i === activeIndex ? "active" : "pending";
          return (
            <li key={topic.day} className="flex items-start gap-2.5 py-1.5">
              <span className="relative flex items-center justify-center mt-0.5 shrink-0" style={{ width: 14 }}>
                {status === "active" && !reduceMotion && (
                  <motion.span
                    className="absolute rounded-full"
                    style={{ width: 14, height: 14, background: BUCKET_COLOR[topic.bucket], opacity: 0.35 }}
                    animate={{ scale: [1, 1.8], opacity: [0.35, 0] }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
                  />
                )}
                <span
                  className="size-2.5 rounded-full border"
                  style={{
                    background: status === "pending" ? "transparent" : BUCKET_COLOR[topic.bucket],
                    borderColor: BUCKET_COLOR[topic.bucket],
                  }}
                />
              </span>
              <div className="min-w-0">
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
