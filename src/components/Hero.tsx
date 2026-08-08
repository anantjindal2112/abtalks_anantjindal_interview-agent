"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { DURATION, EASE_OUT } from "@/lib/motion";

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
    example:
      "e.g. a candidate who passed \"Embeddings\" first-try but needed 4 attempts on \"Prompt Engineering\" opens on the struggle, not the easy win.",
  },
  {
    icon: "↳",
    title: "Adaptive follow-ups",
    desc: "The model decides whether to probe deeper on an answer or move on, reacting to what was actually said.",
    example:
      "e.g. a vague answer gets decision: CLARIFY and a sharper same-topic question — not a polite \"great, thanks!\" and a scripted next question.",
  },
  {
    icon: "✓",
    title: "Guaranteed coverage",
    desc: "≥8 questions across ≥4 curriculum days is enforced in code, never left to the model's discretion.",
    example:
      "e.g. if the model tries to wrap up early, route.ts force-overrides it to next_topic until the minimum is actually met — every time.",
  },
  {
    icon: "▤",
    title: "Structured feedback",
    desc: "Every interview ends with a grounded summary, strengths, gaps, and concrete next steps.",
    example:
      "e.g. 5 category scores + real misconceptions only — a field the model didn't confidently return is dropped, never faked to look complete.",
  },
];

function FeatureCard({
  f,
  index,
  reduceMotion,
}: {
  f: (typeof FEATURES)[number];
  index: number;
  reduceMotion: boolean | null;
}) {
  const [flipped, setFlipped] = useState(false);
  // Both faces occupy the SAME CSS grid cell (grid-area: 1/1) instead of
  // position:absolute with a guessed fixed height — the grid row then
  // auto-sizes to whichever face is naturally taller, at every viewport
  // width, so real text can never overflow past the card's own border.
  const faceStyle: React.CSSProperties = {
    gridArea: "1 / 1",
    backfaceVisibility: "hidden",
    WebkitBackfaceVisibility: "hidden",
  };

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reduceMotion ? 0 : 0.15 + index * 0.06, duration: 0.25 }}
      style={{ perspective: 900 }}
    >
      <button
        type="button"
        onClick={() => setFlipped((v) => !v)}
        aria-pressed={flipped}
        aria-label={`${f.title} — click to ${flipped ? "show description" : "show a concrete example"}`}
        className="w-full text-left cursor-pointer block"
      >
        <motion.div
          className="w-full grid"
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{ duration: reduceMotion ? 0 : DURATION.card * 1.8, ease: EASE_OUT }}
          style={{ transformStyle: "preserve-3d" }}
        >
          {/* front */}
          <div
            className="rounded-lg border p-3.5 flex flex-col"
            style={{ borderColor: "var(--border)", background: "var(--bg-inset)", ...faceStyle }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="mono text-base" style={{ color: "var(--accent-2)" }} aria-hidden>
                {f.icon}
              </div>
              <span className="mono text-[9px] shrink-0" style={{ color: "var(--fg-dim)", opacity: 0.55 }} aria-hidden>
                flip ⟳
              </span>
            </div>
            <div className="mt-1.5 text-sm font-medium" style={{ color: "var(--fg)" }}>
              {f.title}
            </div>
            <div className="mt-1 text-xs leading-relaxed" style={{ color: "var(--fg-dim)" }}>
              {f.desc}
            </div>
          </div>
          {/* back */}
          <div
            className="rounded-lg border p-3.5 flex flex-col"
            style={{
              borderColor: "var(--accent-2)",
              background: "var(--bg-inset)",
              transform: "rotateY(180deg)",
              ...faceStyle,
            }}
          >
            <div className="mono text-[9px] uppercase tracking-wide" style={{ color: "var(--accent-2)" }} aria-hidden>
              example
            </div>
            <div className="mt-1.5 text-xs leading-relaxed" style={{ color: "var(--fg)" }}>
              {f.example}
            </div>
          </div>
        </motion.div>
      </button>
    </motion.div>
  );
}

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
            <FeatureCard key={f.title} f={f} index={i} reduceMotion={reduceMotion} />
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
