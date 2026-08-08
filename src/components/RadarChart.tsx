"use client";

import { motion, useReducedMotion } from "framer-motion";
import { DURATION } from "@/lib/motion";
import type { CategoryScores } from "@/lib/types";

const AXES: Array<{ key: keyof CategoryScores; label: string }> = [
  { key: "technicalKnowledge", label: "Technical" },
  { key: "engineeringReasoning", label: "Reasoning" },
  { key: "systemDesign", label: "System Design" },
  { key: "communication", label: "Communication" },
  { key: "productionAwareness", label: "Production" },
];

const SIZE = 220;
const CENTER = SIZE / 2;
const RADIUS = 78;

function pointFor(index: number, value: number) {
  const angle = (Math.PI * 2 * index) / AXES.length - Math.PI / 2;
  const r = (Math.max(0, Math.min(100, value)) / 100) * RADIUS;
  return [CENTER + r * Math.cos(angle), CENTER + r * Math.sin(angle)] as const;
}

function ringPoints(scale: number) {
  return AXES.map((_, i) => pointFor(i, 100 * scale).join(",")).join(" ");
}

export function RadarChart({ scores }: { scores: CategoryScores }) {
  const reduceMotion = useReducedMotion();
  const dataPoints = AXES.map((a, i) => pointFor(i, scores[a.key]).join(",")).join(" ");

  return (
    <div className="flex flex-col items-center">
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        {/* background grid rings */}
        {[0.33, 0.66, 1].map((s) => (
          <polygon key={s} points={ringPoints(s)} fill="none" stroke="var(--border)" strokeWidth={1} />
        ))}
        {/* axis lines */}
        {AXES.map((_, i) => {
          const [x, y] = pointFor(i, 100);
          return <line key={i} x1={CENTER} y1={CENTER} x2={x} y2={y} stroke="var(--border)" strokeWidth={1} />;
        })}
        {/* data polygon — grows from center outward */}
        <motion.polygon
          points={dataPoints}
          fill="var(--accent-2)"
          fillOpacity={0.25}
          stroke="var(--accent-2)"
          strokeWidth={1.5}
          style={{ transformOrigin: `${CENTER}px ${CENTER}px` }}
          initial={reduceMotion ? false : { scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: DURATION.report, ease: "easeOut" }}
        />
        {AXES.map((a, i) => {
          const [x, y] = pointFor(i, scores[a.key]);
          return <circle key={a.key} cx={x} cy={y} r={2.5} fill="var(--accent-2)" />;
        })}
      </svg>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 mt-2">
        {AXES.map((a, i) => (
          <motion.div
            key={a.key}
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: reduceMotion ? 0 : DURATION.report + i * 0.05, duration: 0.2 }}
            className="mono text-[10px] flex items-center gap-1.5"
            style={{ color: "var(--fg-dim)" }}
          >
            <span className="size-1.5 rounded-full shrink-0" style={{ background: "var(--accent-2)" }} />
            {a.label} · {scores[a.key]}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
