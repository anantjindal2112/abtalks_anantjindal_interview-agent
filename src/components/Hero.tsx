"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

const COMMAND = "npx interview_agent --cohort=ai-cohort --candidate=next";

function TypedCommand() {
  const reduceMotion = useReducedMotion();
  const [shown, setShown] = useState(reduceMotion ? COMMAND.length : 0);

  useEffect(() => {
    if (reduceMotion) return;
    if (shown >= COMMAND.length) return;
    const id = setTimeout(() => setShown((n) => n + 1), 28);
    return () => clearTimeout(id);
  }, [shown, reduceMotion]);

  return (
    <span className="mono">
      {COMMAND.slice(0, shown)}
      <span aria-hidden className="inline-block w-[0.55ch] -mb-0.5" style={{ background: "var(--accent)" }}>
        &nbsp;
      </span>
    </span>
  );
}

const FEATURES = [
  {
    icon: "◆",
    title: "Grounded in real history",
    desc: "Topics are chosen from what each candidate actually passed, struggled with, or skipped — not a fixed script.",
  },
  {
    icon: "↳",
    title: "Adaptive follow-ups",
    desc: "The model decides whether to probe deeper on an answer or move on, reacting to what was actually said.",
  },
  {
    icon: "✓",
    title: "Guaranteed coverage",
    desc: "≥8 questions across ≥4 curriculum days is enforced in code, never left to the model's discretion.",
  },
  {
    icon: "▤",
    title: "Structured feedback",
    desc: "Every interview ends with a grounded summary, strengths, gaps, and concrete next steps.",
  },
];

export function Hero({ onViewSample }: { onViewSample: () => void }) {
  const reduceMotion = useReducedMotion();
  return (
    <div className="mb-8">
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="rounded-xl border p-6 sm:p-8"
        style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}
      >
        <div className="mono text-xs" style={{ color: "var(--accent)" }}>
          <TypedCommand />
        </div>
        <h1 className="mt-3 text-2xl sm:text-3xl font-semibold tracking-tight" style={{ color: "var(--fg)" }}>
          Technical interviews that actually adapt.
        </h1>
        <p className="mt-2 max-w-2xl text-sm sm:text-[15px] leading-relaxed" style={{ color: "var(--fg-dim)" }}>
          An AI interview agent for The AI Cohort — it builds a personalized interview plan from each candidate&apos;s
          real 31-day mission history, asks intelligent follow-ups, and closes with structured, actionable feedback.
        </p>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: reduceMotion ? 0 : 0.15 + i * 0.06, duration: 0.25 }}
              className="rounded-lg border p-3.5"
              style={{ borderColor: "var(--border)", background: "var(--bg-inset)" }}
            >
              <div className="mono text-base" style={{ color: "var(--accent-2)" }} aria-hidden>
                {f.icon}
              </div>
              <div className="mt-1.5 text-sm font-medium" style={{ color: "var(--fg)" }}>
                {f.title}
              </div>
              <div className="mt-1 text-xs leading-relaxed" style={{ color: "var(--fg-dim)" }}>
                {f.desc}
              </div>
            </motion.div>
          ))}
        </div>

        <motion.button
          type="button"
          onClick={onViewSample}
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: reduceMotion ? 0 : 0.45, duration: 0.25 }}
          className="mono text-xs mt-5 cursor-pointer hover:underline"
          style={{ color: "var(--accent-2)" }}
        >
          → View a sample completed interview (real transcript, no waiting)
        </motion.button>
      </motion.div>
    </div>
  );
}
