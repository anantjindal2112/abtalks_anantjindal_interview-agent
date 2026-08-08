"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { TerminalShell } from "@/components/TerminalShell";
import { DashboardButton } from "@/components/DashboardButton";
import { DURATION } from "@/lib/motion";
import type { CategoryScores, Feedback } from "@/lib/types";

type Record = {
  sessionId: string;
  member: { id: string; name: string; jobRole: string };
  questionsAsked: number;
  daysCovered: number;
  skipCount: number;
  completedAt: number;
  feedback: Feedback;
};

const CATEGORY_LABELS: Array<{ key: keyof CategoryScores; label: string }> = [
  { key: "technicalKnowledge", label: "Technical Knowledge" },
  { key: "engineeringReasoning", label: "Engineering Reasoning" },
  { key: "systemDesign", label: "System Design" },
  { key: "communication", label: "Communication" },
  { key: "productionAwareness", label: "Production Awareness" },
];

function average(scores: CategoryScores): number {
  const vals = Object.values(scores);
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export default function RecordsPage() {
  const reduceMotion = useReducedMotion();
  const [records, setRecords] = useState<Record[] | null>(null);

  useEffect(() => {
    fetch("/api/interview/records")
      .then((res) => res.json())
      .then((data) => setRecords(data.records ?? []))
      .catch(() => setRecords([]));
  }, []);

  const scored = (records ?? []).filter((r) => r.feedback.categoryScores);
  const overallBest = scored.length
    ? scored.reduce((best, r) => (average(r.feedback.categoryScores!) > average(best.feedback.categoryScores!) ? r : best))
    : null;
  const categoryBests = new Map<keyof CategoryScores, Record>();
  for (const { key } of CATEGORY_LABELS) {
    const best = scored.length
      ? scored.reduce((b, r) => (r.feedback.categoryScores![key] > b.feedback.categoryScores![key] ? r : b))
      : null;
    if (best) categoryBests.set(key, best);
  }

  return (
    <div
      className="flex-1 flex flex-col items-center px-4 py-8 sm:py-12"
      style={{
        background: "radial-gradient(circle at 1px 1px, var(--border) 1px, transparent 0) 0 0 / 22px 22px, var(--bg)",
      }}
    >
      <div className="w-full max-w-4xl">
        <div className="mb-6 flex items-baseline justify-between gap-2">
          <Link href="/" className="mono text-sm font-semibold" style={{ color: "var(--fg)" }}>
            interview_agent
          </Link>
          <div className="flex items-center gap-3">
            <span className="mono text-xs" style={{ color: "var(--fg-dim)" }}>
              cohort insights · demo/judge view
            </span>
            <DashboardButton />
          </div>
        </div>

        <TerminalShell title="insights@ai-cohort:~/records$">
          <div className="p-5 sm:p-6 flex flex-col gap-6">
            <div>
              <h1 className="text-lg font-semibold" style={{ color: "var(--fg)" }}>
                Cohort Insights
              </h1>
              <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--fg-dim)" }}>
                Every interview actually completed on this server, ranked by category. This is a demo/judge-facing
                view — real candidates never see this, and it&apos;s built from in-memory state, so it resets on
                server restart (same trade-off documented throughout this app).
              </p>
            </div>

            {records === null && (
              <p className="mono text-xs" style={{ color: "var(--fg-dim)" }}>
                Loading…
              </p>
            )}

            {records?.length === 0 && (
              <p className="mono text-xs" style={{ color: "var(--fg-dim)" }}>
                No completed interviews yet on this server. Finish one from the home page and it&apos;ll show up
                here.
              </p>
            )}

            {overallBest && (
              <motion.div
                initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: DURATION.card }}
                className="rounded-lg border p-4"
                style={{ borderColor: "var(--accent)", background: "var(--bg-inset)" }}
              >
                <div className="mono text-[10px] uppercase tracking-wide" style={{ color: "var(--accent)" }}>
                  ★ overall best
                </div>
                <div className="mt-1 text-base font-semibold" style={{ color: "var(--fg)" }}>
                  {overallBest.member.name}
                </div>
                <div className="mono text-xs mt-0.5" style={{ color: "var(--fg-dim)" }}>
                  {overallBest.member.jobRole} · avg {average(overallBest.feedback.categoryScores!).toFixed(0)}/100
                </div>
              </motion.div>
            )}

            {categoryBests.size > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {CATEGORY_LABELS.map(({ key, label }, i) => {
                  const best = categoryBests.get(key);
                  if (!best) return null;
                  return (
                    <motion.div
                      key={key}
                      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: reduceMotion ? 0 : i * 0.05, duration: DURATION.card }}
                      className="rounded-md border p-2.5"
                      style={{ borderColor: "var(--border)", background: "var(--bg-inset)" }}
                    >
                      <div className="mono text-[9px] uppercase tracking-wide" style={{ color: "var(--fg-dim)" }}>
                        {label}
                      </div>
                      <div className="text-xs font-medium mt-0.5 truncate" style={{ color: "var(--fg)" }}>
                        {best.member.name}
                      </div>
                      <div className="mono text-[10px]" style={{ color: "var(--accent-2)" }}>
                        {best.feedback.categoryScores![key]}/100
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}

            {records && records.length > 0 && (
              <div className="pt-2 border-t flex flex-col gap-2" style={{ borderColor: "var(--border)" }}>
                <h2 className="mono text-[11px] uppercase tracking-wide mt-2" style={{ color: "var(--fg-dim)" }}>
                  all completed interviews
                </h2>
                {records.map((r, i) => (
                  <motion.div
                    key={r.sessionId}
                    initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: reduceMotion ? 0 : i * 0.04, duration: DURATION.card }}
                    className="rounded-md border p-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4"
                    style={{ borderColor: "var(--border)", background: "var(--bg-inset)" }}
                  >
                    <div className="min-w-0 sm:w-40 shrink-0">
                      <div className="text-sm font-medium truncate" style={{ color: "var(--fg)" }}>
                        {r.member.name}
                      </div>
                      <div className="mono text-[10px] truncate" style={{ color: "var(--fg-dim)" }}>
                        {r.member.jobRole}
                      </div>
                    </div>
                    {r.feedback.categoryScores && (
                      <div className="flex-1 grid grid-cols-5 gap-1.5">
                        {CATEGORY_LABELS.map(({ key }) => (
                          <div key={key} className="flex flex-col items-center">
                            <div className="h-8 w-2 rounded-full overflow-hidden flex flex-col justify-end" style={{ background: "var(--bg-elevated)" }}>
                              <div
                                className="w-full rounded-full"
                                style={{
                                  height: `${r.feedback.categoryScores![key]}%`,
                                  background: "var(--accent-2)",
                                }}
                              />
                            </div>
                            <span className="mono text-[8px] mt-0.5" style={{ color: "var(--fg-dim)" }}>
                              {r.feedback.categoryScores![key]}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="mono text-[10px] shrink-0" style={{ color: "var(--fg-dim)" }}>
                      {r.questionsAsked}q · {r.daysCovered}d{r.skipCount > 0 ? ` · ${r.skipCount} skipped` : ""}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </TerminalShell>

        <footer className="mt-8 text-center mono text-[11px]" style={{ color: "var(--fg-dim)" }}>
          Built for the ABTalks Vibe Code Hackathon · candidate & curriculum data are synthetic
        </footer>
      </div>
    </div>
  );
}
