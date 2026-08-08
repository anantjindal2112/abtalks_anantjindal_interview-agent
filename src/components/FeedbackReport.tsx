"use client";

import { motion, useReducedMotion } from "framer-motion";
import { TerminalShell } from "./TerminalShell";
import type { Candidate, Feedback } from "@/lib/types";

function Section({
  title,
  icon,
  color,
  items,
  delayBase,
}: {
  title: string;
  icon: string;
  color: string;
  items: string[];
  delayBase: number;
}) {
  const reduceMotion = useReducedMotion();
  if (!items.length) return null;
  return (
    <div>
      <h3 className="mono text-xs uppercase tracking-wide flex items-center gap-1.5" style={{ color }}>
        <span aria-hidden>{icon}</span> {title}
      </h3>
      <ul className="mt-2 flex flex-col gap-1.5">
        {items.map((item, i) => (
          <motion.li
            key={i}
            initial={reduceMotion ? false : { opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: reduceMotion ? 0 : delayBase + i * 0.08, duration: 0.25 }}
            className="text-sm leading-relaxed pl-4 relative"
            style={{ color: "var(--fg)" }}
          >
            <span className="absolute left-0" style={{ color }} aria-hidden>
              {icon === "✓" ? "+" : icon === "⚠" ? "!" : "→"}
            </span>
            {item}
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

export function FeedbackReport({
  candidate,
  feedback,
  onRestart,
}: {
  candidate: Candidate;
  feedback: Feedback;
  onRestart: () => void;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <TerminalShell title={`feedback@ai-cohort:~/report/${candidate.member.id}$`}>
        <div className="p-5 sm:p-6 flex flex-col gap-6">
          <div>
            <div className="mono text-[11px]" style={{ color: "var(--accent)" }}>
              ✓ interview complete
            </div>
            <h2 className="text-lg font-semibold mt-1" style={{ color: "var(--fg)" }}>
              {candidate.member.name}
            </h2>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--fg-dim)" }}>
              {feedback.summary}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <Section title="Strengths" icon="✓" color="var(--accent)" items={feedback.strengths} delayBase={0.1} />
            <Section title="Gaps" icon="⚠" color="var(--warn)" items={feedback.gaps} delayBase={0.2} />
            <Section title="Next steps" icon="→" color="var(--accent-2)" items={feedback.next} delayBase={0.3} />
          </div>

          <div className="pt-2 border-t" style={{ borderColor: "var(--border)" }}>
            <button
              type="button"
              onClick={onRestart}
              className="mt-4 rounded-md px-4 py-2 text-sm font-medium border cursor-pointer"
              style={{ borderColor: "var(--border)", color: "var(--fg)" }}
            >
              ← Interview another candidate
            </button>
          </div>
        </div>
      </TerminalShell>
    </motion.div>
  );
}
