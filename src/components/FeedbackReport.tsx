"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { TerminalShell } from "./TerminalShell";
import { RadarChart } from "./RadarChart";
import { CategoryScoreBars } from "./CategoryScoreBars";
import { MasteryHeatmap } from "./MasteryHeatmap";
import { JudgeMode } from "./JudgeMode";
import { DURATION } from "@/lib/motion";
import type { TurnEvaluation } from "./RoadmapTrail";
import type { Candidate, Feedback } from "@/lib/types";

/** Restrained completion mark: circle fades in, then the check path draws
 * itself. No confetti/burst — this is an enterprise technical interview,
 * not a streak celebration. */
function CompleteCheck() {
  const reduceMotion = useReducedMotion();
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" className="inline-block align-middle mr-1.5" aria-hidden>
      <motion.circle
        cx="10"
        cy="10"
        r="9"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.5"
        initial={reduceMotion ? false : { opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: DURATION.card }}
      />
      <motion.path
        d="M5.5 10.5l3 3 6-6.5"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={reduceMotion ? false : { pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: DURATION.graph, delay: reduceMotion ? 0 : DURATION.card, ease: "easeOut" }}
      />
    </svg>
  );
}

function toMarkdown(candidate: Candidate, feedback: Feedback): string {
  const list = (items: string[]) => (items.length ? items.map((i) => `- ${i}`).join("\n") : "- (none)");
  return `# Interview Feedback — ${candidate.member.name}

**Role:** ${candidate.member.jobRole} (${candidate.member.yearsExperience}y exp)

## Summary
${feedback.summary}

## Strengths
${list(feedback.strengths)}

## Gaps
${list(feedback.gaps)}

## Next steps
${list(feedback.next)}
`;
}

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
  sessionId,
  sampleEvaluations,
  onRestart,
}: {
  candidate: Candidate;
  feedback: Feedback;
  sessionId: string;
  /** When set (sample-demo mode), skips the live fetch entirely and renders
   * this real, previously-captured evaluations trail instead — same shape,
   * same component, just no network round-trip. */
  sampleEvaluations?: TurnEvaluation[];
  onRestart: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const [copied, setCopied] = useState(false);
  const [evaluations, setEvaluations] = useState<TurnEvaluation[]>(sampleEvaluations ?? []);
  // Judge Mode was live-only before — every turn's real decision/reasoning/
  // assessment is already fetched for the heatmap below, so just also let the
  // candidate's full report expose it instead of throwing it away after use.
  const [judgeOpen, setJudgeOpen] = useState(false);

  // Free GET, no Groq call — same evaluations trail Judge Mode used during
  // the interview, fetched once here to build the mastery heatmap honestly
  // from what was actually assessed rather than re-deriving it some other way.
  useEffect(() => {
    if (sampleEvaluations) return; // already have real data, nothing to fetch
    let cancelled = false;
    fetch(`/api/interview?sessionId=${encodeURIComponent(sessionId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.evaluations) setEvaluations(data.evaluations);
      })
      .catch(() => {
        // heatmap just shows "not assessed" everywhere if this fails — non-critical
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, sampleEvaluations]);

  async function copyMarkdown() {
    try {
      await navigator.clipboard.writeText(toMarkdown(candidate, feedback));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard permission denied — non-critical, user can still use download
    }
  }

  function downloadReport() {
    const blob = new Blob([toMarkdown(candidate, feedback)], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${candidate.member.id}-interview-feedback.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.report }}
    >
      <TerminalShell title={`feedback@ai-cohort:~/report/${candidate.member.id}$`}>
        <div className="p-5 sm:p-6 flex flex-col gap-6">
          <div>
            <div className="mono text-[11px] flex items-center" style={{ color: "var(--accent)" }}>
              <CompleteCheck /> interview complete
            </div>
            <h2 className="text-lg font-semibold mt-1" style={{ color: "var(--fg)" }}>
              {candidate.member.name}
            </h2>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--fg-dim)" }}>
              {feedback.summary}
            </p>
          </div>

          {feedback.categoryScores && (
            <div className="pt-4 border-t grid grid-cols-1 sm:grid-cols-2 gap-6 items-center" style={{ borderColor: "var(--border)" }}>
              <RadarChart scores={feedback.categoryScores} />
              <CategoryScoreBars scores={feedback.categoryScores} />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <Section title="Strengths" icon="✓" color="var(--accent)" items={feedback.strengths} delayBase={0.1} />
            <Section title="Gaps" icon="⚠" color="var(--warn)" items={feedback.gaps} delayBase={0.2} />
            <Section title="Next steps" icon="→" color="var(--accent-2)" items={feedback.next} delayBase={0.3} />
          </div>

          {!!feedback.misconceptions?.length && (
            <div className="pt-4 border-t" style={{ borderColor: "var(--border)" }}>
              <h3 className="mono text-xs uppercase tracking-wide" style={{ color: "var(--danger)" }}>
                misconceptions detected
              </h3>
              <ul className="mt-2 flex flex-col gap-2">
                {feedback.misconceptions.map((m, i) => (
                  <motion.li
                    key={i}
                    initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: reduceMotion ? 0 : i * 0.08, duration: 0.2 }}
                    className="text-sm leading-relaxed rounded-md border px-3 py-2"
                    style={{ borderColor: "var(--danger)", background: "var(--bg-inset)", color: "var(--fg)" }}
                  >
                    {m}
                  </motion.li>
                ))}
              </ul>
            </div>
          )}

          {evaluations.length > 0 && (
            <div className="pt-4 border-t" style={{ borderColor: "var(--border)" }}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="mono text-xs uppercase tracking-wide" style={{ color: "var(--fg-dim)" }}>
                  interview transcript &amp; reasoning
                </h3>
                <button
                  type="button"
                  onClick={() => setJudgeOpen((v) => !v)}
                  aria-pressed={judgeOpen}
                  className="mono text-[11px] rounded-full border px-2.5 py-1 cursor-pointer transition-colors"
                  style={{
                    borderColor: judgeOpen ? "var(--accent-2)" : "var(--border)",
                    color: judgeOpen ? "var(--accent-2)" : "var(--fg-dim)",
                  }}
                >
                  {judgeOpen ? "✓ judge mode" : "judge mode"} · {evaluations.length} question{evaluations.length === 1 ? "" : "s"}
                </button>
              </div>
              <p className="mt-1 text-xs" style={{ color: "var(--fg-dim)" }}>
                Every question this interview actually asked, why it asked it, and how the answer was scored — the
                same live Judge Mode trail from the interview, kept here so it isn&apos;t thrown away once the chat
                closes.
              </p>
              <JudgeMode evaluations={evaluations} open={judgeOpen} />
            </div>
          )}

          {evaluations.length > 0 && (
            <div className="pt-4 border-t" style={{ borderColor: "var(--border)" }}>
              <h3 className="mono text-xs uppercase tracking-wide" style={{ color: "var(--fg-dim)" }}>
                curriculum mastery — this interview
              </h3>
              <p className="mt-1 text-xs" style={{ color: "var(--fg-dim)" }}>
                Only the {new Set(evaluations.map((e) => e.day)).size} days actually covered in this interview are
                scored — everything else is honestly &quot;not assessed&quot;, not guessed.
              </p>
              <div className="mt-3">
                <MasteryHeatmap evaluations={evaluations} />
              </div>
            </div>
          )}

          <div className="pt-2 border-t flex flex-wrap gap-2" style={{ borderColor: "var(--border)" }}>
            <button
              type="button"
              onClick={onRestart}
              className="mt-4 rounded-md px-4 py-2 text-sm font-medium border cursor-pointer"
              style={{ borderColor: "var(--border)", color: "var(--fg)" }}
            >
              ← Interview another candidate
            </button>
            <button
              type="button"
              onClick={copyMarkdown}
              className="mt-4 rounded-md px-4 py-2 text-sm font-medium border cursor-pointer"
              style={{ borderColor: "var(--border)", color: "var(--fg)" }}
            >
              {copied ? "✓ copied" : "Copy as Markdown"}
            </button>
            <button
              type="button"
              onClick={downloadReport}
              className="mt-4 rounded-md px-4 py-2 text-sm font-medium border cursor-pointer"
              style={{ borderColor: "var(--border)", color: "var(--fg)" }}
            >
              ↓ Download .md
            </button>
          </div>
        </div>
      </TerminalShell>
    </motion.div>
  );
}
