"use client";

import { motion, useReducedMotion } from "framer-motion";
import { curriculum } from "@/lib/data";
import type { TurnEvaluation } from "./RoadmapTrail";

type Status = "strong" | "developing" | "needs-review" | "not-assessed";

const STATUS_COLOR: Record<Status, string> = {
  strong: "var(--accent)",
  developing: "var(--warn)",
  "needs-review": "var(--danger)",
  "not-assessed": "var(--skip)",
};

const STATUS_LABEL: Record<Status, string> = {
  strong: "Strong",
  developing: "Developing",
  "needs-review": "Needs review",
  "not-assessed": "Not assessed",
};

/**
 * Real per-day status derived only from turns that were ACTUALLY assessed in
 * THIS interview — never from cohort mission history (that's a different
 * signal, already shown on the Learning Map) and never fabricated for days
 * the interview never touched. Untested days are honestly "not assessed".
 */
function statusFor(day: number, evaluations: TurnEvaluation[]): Status {
  const scored = evaluations.filter((e) => e.day === day && e.assessment);
  if (!scored.length) return "not-assessed";
  const avg = scored.reduce((sum, e) => sum + (e.assessment!.correctness + e.assessment!.depth) / 2, 0) / scored.length;
  if (avg >= 7) return "strong";
  if (avg >= 4) return "developing";
  return "needs-review";
}

export function MasteryHeatmap({ evaluations }: { evaluations: TurnEvaluation[] }) {
  const reduceMotion = useReducedMotion();

  return (
    <div>
      <div className="grid grid-cols-8 sm:grid-cols-10 gap-1.5">
        {curriculum.days.map((d, i) => {
          const status = statusFor(d.day, evaluations);
          return (
            <motion.div
              key={d.day}
              initial={reduceMotion ? false : { opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: reduceMotion ? 0 : i * 0.015, duration: 0.2 }}
              whileHover={reduceMotion ? undefined : { scale: 1.15 }}
              className="aspect-square rounded flex items-center justify-center mono text-[9px] cursor-default"
              style={{
                background: status === "not-assessed" ? "var(--bg-inset)" : STATUS_COLOR[status],
                opacity: status === "not-assessed" ? 0.5 : 0.85,
                color: status === "not-assessed" ? "var(--fg-dim)" : "var(--accent-fg)",
              }}
              title={`Day ${d.day} — ${d.title}\n${STATUS_LABEL[status]}`}
            >
              {d.day}
            </motion.div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-3 mt-3">
        {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
          <div key={s} className="flex items-center gap-1.5 mono text-[10px]" style={{ color: "var(--fg-dim)" }}>
            <span className="size-2 rounded-sm" style={{ background: STATUS_COLOR[s], opacity: s === "not-assessed" ? 0.5 : 0.85 }} />
            {STATUS_LABEL[s]}
          </div>
        ))}
      </div>
    </div>
  );
}
