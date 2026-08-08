"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { sampleCandidates } from "@/lib/data";
import { summarizeCandidate } from "@/lib/plan";
import type { Candidate } from "@/lib/types";

function isCandidateShape(x: unknown): x is Candidate {
  if (!x || typeof x !== "object") return false;
  const c = x as Record<string, unknown>;
  return !!c.member && typeof c.member === "object" && Array.isArray(c.missions);
}

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
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [jsonInput, setJsonInput] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);

  function submitCustomCandidate() {
    try {
      const parsed = JSON.parse(jsonInput);
      if (!isCandidateShape(parsed)) {
        setJsonError("Valid JSON, but it's missing member/missions — check the candidate.json shape.");
        return;
      }
      setJsonError(null);
      onSelect(parsed);
    } catch {
      setJsonError("That's not valid JSON.");
    }
  }

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
            whileHover={reduceMotion ? undefined : { y: -3 }}
            whileTap={reduceMotion ? undefined : { scale: 0.98 }}
            transition={{ delay: reduceMotion ? 0 : i * 0.03, duration: 0.25 }}
          >
            <button
              type="button"
              onClick={() => onSelect(candidate)}
              className="w-full text-left rounded-lg border p-4 transition-shadow cursor-pointer hover:border-[var(--accent-2)] hover:shadow-md focus-visible:border-[var(--accent-2)]"
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

      <div className="mt-6 pt-5 border-t" style={{ borderColor: "var(--border)" }}>
        <button
          type="button"
          onClick={() => setAdvancedOpen((v) => !v)}
          className="mono text-xs cursor-pointer flex items-center gap-1.5"
          style={{ color: "var(--fg-dim)" }}
          aria-expanded={advancedOpen}
          aria-controls="advanced-candidate-json"
        >
          <span aria-hidden>{advancedOpen ? "▾" : "▸"}</span>
          advanced: bring your own candidate.json
        </button>

        {advancedOpen && (
          <motion.div
            id="advanced-candidate-json"
            initial={reduceMotion ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            transition={{ duration: 0.2 }}
            className="mt-3 overflow-hidden"
          >
            <label htmlFor="candidate-json-input" className="sr-only">
              Candidate JSON
            </label>
            <textarea
              id="candidate-json-input"
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              placeholder='{"member": {...}, "missions": [...], "signals": {...}}'
              rows={4}
              className="mono w-full resize-y rounded-md border px-3 py-2 text-xs outline-none"
              style={{ background: "var(--bg-inset)", borderColor: "var(--border)", color: "var(--fg)" }}
            />
            {jsonError && (
              <p role="alert" className="mt-1.5 text-xs" style={{ color: "var(--danger)" }}>
                {jsonError}
              </p>
            )}
            <button
              type="button"
              onClick={submitCustomCandidate}
              disabled={!jsonInput.trim()}
              className="mt-2 rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
            >
              Start interview with this candidate
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
}
