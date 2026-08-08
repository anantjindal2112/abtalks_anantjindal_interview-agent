"use client";

import { motion, useReducedMotion } from "framer-motion";
import { sampleCandidates } from "@/lib/data";
import { summarizeCandidate } from "@/lib/plan";
import type { Candidate } from "@/lib/types";

const BUCKET_LABEL: Record<string, string> = {
  confident: "passed first-try",
  struggled: "multiple attempts",
  failed: "not passed",
  skipped: "skipped",
};

function BucketBar({ candidate }: { candidate: Candidate }) {
  const counts = summarizeCandidate(candidate);
  const total = Math.max(1, candidate.missions.length);
  const segments: Array<[keyof typeof counts, string]> = [
    ["confident", "var(--accent)"],
    ["struggled", "var(--warn)"],
    ["failed", "var(--danger)"],
    ["skipped", "var(--skip)"],
  ];
  return (
    <div>
      <div className="flex h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--bg-inset)" }}>
        {segments.map(([key, color]) =>
          counts[key] > 0 ? (
            <span
              key={key}
              style={{ width: `${(counts[key] / total) * 100}%`, background: color }}
              title={`${counts[key]} ${BUCKET_LABEL[key]}`}
            />
          ) : null
        )}
      </div>
    </div>
  );
}

export function CandidatePicker({ onSelect }: { onSelect: (candidate: Candidate) => void }) {
  const reduceMotion = useReducedMotion();

  return (
    <div className="p-5 sm:p-6">
      <h2 className="text-base font-semibold" style={{ color: "var(--fg)" }}>
        Select a candidate to interview
      </h2>
      <p className="mt-1 text-sm" style={{ color: "var(--fg-dim)" }}>
        Each of these is a synthetic AI Cohort graduate with a real (synthetic) mission history — the interview
        plan below is built from what they actually passed, struggled with, or skipped.
      </p>

      <ul className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {sampleCandidates.map((candidate, i) => (
          <motion.li
            key={candidate.member.id}
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: reduceMotion ? 0 : i * 0.03, duration: 0.25 }}
          >
            <button
              type="button"
              onClick={() => onSelect(candidate)}
              className="w-full text-left rounded-lg border p-4 transition-colors cursor-pointer hover:border-[var(--accent-2)] focus-visible:border-[var(--accent-2)]"
              style={{ background: "var(--bg-inset)", borderColor: "var(--border)" }}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium text-sm" style={{ color: "var(--fg)" }}>
                  {candidate.member.name}
                </span>
                <span className="mono text-[11px]" style={{ color: "var(--fg-dim)" }}>
                  {candidate.member.id}
                </span>
              </div>
              <div className="text-xs mt-0.5" style={{ color: "var(--fg-dim)" }}>
                {candidate.member.jobRole} · {candidate.member.yearsExperience}y exp
              </div>
              <div className="mt-3">
                <BucketBar candidate={candidate} />
                <div className="mt-1.5 flex justify-between mono text-[10px]" style={{ color: "var(--fg-dim)" }}>
                  <span>{candidate.signals.missionsCompleted} missions</span>
                  <span>{candidate.signals.commitDays} commit days</span>
                  <span>{candidate.signals.missionsFirstTry} first-try</span>
                </div>
              </div>
            </button>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}
