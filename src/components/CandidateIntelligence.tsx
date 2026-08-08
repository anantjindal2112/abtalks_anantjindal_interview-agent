"use client";

import { motion, useReducedMotion } from "framer-motion";
import { TerminalShell } from "./TerminalShell";
import { buildLearningMap, type LearningMapEntry } from "@/lib/plan";
import type { Candidate } from "@/lib/types";

function ProgressRing({ value, total }: { value: number; total: number }) {
  const reduceMotion = useReducedMotion();
  const pct = total ? value / total : 0;
  const size = 96;
  const stroke = 8;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-inset)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference * (1 - pct) }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.8, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="mono text-lg font-semibold" style={{ color: "var(--fg)" }}>
          {value}
        </span>
        <span className="mono text-[10px]" style={{ color: "var(--fg-dim)" }}>
          / {total} days
        </span>
      </div>
    </div>
  );
}

function SignalGroup({
  label,
  hint,
  color,
  entries,
  delayBase,
}: {
  label: string;
  hint: string;
  color: string;
  entries: LearningMapEntry[];
  delayBase: number;
}) {
  const reduceMotion = useReducedMotion();
  if (!entries.length) return null;
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <h4 className="mono text-[11px] uppercase tracking-wide" style={{ color }}>
          {label}
        </h4>
        <span className="mono text-[10px]" style={{ color: "var(--fg-dim)" }}>
          {hint}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {entries.map((e, i) => (
          <motion.span
            key={e.day}
            initial={reduceMotion ? false : { opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: reduceMotion ? 0 : delayBase + i * 0.03, duration: 0.2 }}
            className="mono text-[11px] rounded-full border px-2 py-0.5"
            style={{ borderColor: color, color: "var(--fg)", background: "var(--bg-inset)" }}
            title={`Day ${e.day}${e.attempts ? ` · ${e.attempts} attempt(s)` : ""}`}
          >
            {e.title}
          </motion.span>
        ))}
      </div>
    </div>
  );
}

export function CandidateIntelligence({
  candidate,
  onBegin,
  onBack,
}: {
  candidate: Candidate;
  onBegin: () => void;
  onBack: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const map = buildLearningMap(candidate);
  const { member, signals } = candidate;

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <TerminalShell title={`profile@ai-cohort:~/candidate/${member.id}$`}>
        <div className="p-5 sm:p-6 flex flex-col gap-6">
          <button
            type="button"
            onClick={onBack}
            className="mono text-[11px] self-start cursor-pointer hover:underline"
            style={{ color: "var(--fg-dim)" }}
          >
            ← choose a different candidate
          </button>

          <div className="flex flex-col sm:flex-row gap-5 items-start sm:items-center">
            <ProgressRing value={map.completedDays} total={map.totalDays} />
            <div className="min-w-0">
              <h2 className="text-xl font-semibold" style={{ color: "var(--fg)" }}>
                {member.name}
              </h2>
              <p className="text-sm mt-0.5" style={{ color: "var(--fg-dim)" }}>
                {member.jobRole} · {member.yearsExperience}y exp · {member.education}
              </p>
              <div className="mt-2 flex gap-4 mono text-[11px]" style={{ color: "var(--fg-dim)" }}>
                <span>{signals.commitDays} commit days</span>
                <span>{signals.missionsFirstTry} passed first-try</span>
                <span>{signals.missionsCompleted} missions completed</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4 pt-4 border-t" style={{ borderColor: "var(--border)" }}>
            <h3 className="mono text-[11px] uppercase tracking-wide" style={{ color: "var(--fg-dim)" }}>
              learning signals — real cohort performance
            </h3>
            <SignalGroup label="Strong" hint="passed first-try" color="var(--accent)" entries={map.strong} delayBase={0.05} />
            <SignalGroup label="Developing" hint="passed, took retries" color="var(--warn)" entries={map.developing} delayBase={0.1} />
            <SignalGroup label="Weak signal" hint="not passed" color="var(--danger)" entries={map.weakSignal} delayBase={0.15} />
            <SignalGroup label="Skipped" hint="never attempted" color="var(--skip)" entries={map.skipped} delayBase={0.2} />
          </div>

          <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-inset)" }}>
            <div className="mono text-[11px]" style={{ color: "var(--accent-2)" }}>
              interview format
            </div>
            <p className="mt-1.5 text-sm leading-relaxed" style={{ color: "var(--fg)" }}>
              Adaptive · concepts, trade-offs, and follow-ups · ~10–13 questions across at least 4 topics from{" "}
              {member.name.split(" ")[0]}&apos;s own cohort work.
            </p>
            <p className="mt-3 text-xs leading-relaxed italic" style={{ color: "var(--fg-dim)" }}>
              &quot;Explain your reasoning as you would to an engineer. I may challenge assumptions or ask follow-up
              questions.&quot;
            </p>
          </div>

          <button
            type="button"
            onClick={onBegin}
            className="self-start rounded-md px-5 py-2.5 text-sm font-medium cursor-pointer"
            style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
          >
            Begin Interview →
          </button>
        </div>
      </TerminalShell>
    </motion.div>
  );
}
