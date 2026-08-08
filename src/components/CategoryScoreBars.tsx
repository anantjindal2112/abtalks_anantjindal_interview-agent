"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { DURATION } from "@/lib/motion";
import type { CategoryScores } from "@/lib/types";

const ROWS: Array<{ key: keyof CategoryScores; label: string }> = [
  { key: "technicalKnowledge", label: "Technical Knowledge" },
  { key: "engineeringReasoning", label: "Engineering Reasoning" },
  { key: "systemDesign", label: "System Design" },
  { key: "communication", label: "Communication" },
  { key: "productionAwareness", label: "Production Awareness" },
];

function CountUp({ to, delay }: { to: number; delay: number }) {
  const reduceMotion = useReducedMotion();
  const [value, setValue] = useState(reduceMotion ? to : 0);

  useEffect(() => {
    if (reduceMotion) return;
    const startTimer = setTimeout(() => {
      const start = performance.now();
      const durationMs = 700;
      function tick(now: number) {
        const t = Math.min(1, (now - start) / durationMs);
        setValue(Math.round(to * (1 - Math.pow(1 - t, 3)))); // ease-out cubic
        if (t < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }, delay * 1000);
    return () => clearTimeout(startTimer);
  }, [to, delay, reduceMotion]);

  return <>{value}</>;
}

export function CategoryScoreBars({ scores }: { scores: CategoryScores }) {
  const reduceMotion = useReducedMotion();
  return (
    <div className="flex flex-col gap-2.5">
      {ROWS.map((row, i) => {
        const value = scores[row.key];
        const delay = reduceMotion ? 0 : i * 0.1;
        return (
          <div key={row.key}>
            <div className="flex justify-between mono text-[11px] mb-1">
              <span style={{ color: "var(--fg)" }}>{row.label}</span>
              <span style={{ color: "var(--fg-dim)" }}>
                <CountUp to={value} delay={delay} />
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--bg-inset)" }}>
              <motion.div
                className="h-full rounded-full"
                style={{ background: "var(--accent-2)" }}
                initial={reduceMotion ? false : { width: "0%" }}
                animate={{ width: `${value}%` }}
                transition={{ duration: DURATION.graph, delay, ease: "easeOut" }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
