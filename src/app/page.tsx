"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { CandidatePicker } from "@/components/CandidatePicker";
import { InterviewChat } from "@/components/InterviewChat";
import { FeedbackReport } from "@/components/FeedbackReport";
import type { Candidate, Feedback } from "@/lib/types";

type Stage =
  | { name: "select" }
  | { name: "interview"; candidate: Candidate; sessionId: string }
  | { name: "done"; candidate: Candidate; feedback: Feedback };

export default function Home() {
  const [stage, setStage] = useState<Stage>({ name: "select" });
  const reduceMotion = useReducedMotion();

  return (
    <div
      className="flex-1 flex flex-col items-center px-4 py-8 sm:py-12"
      style={{
        background:
          "radial-gradient(circle at 1px 1px, var(--border) 1px, transparent 0) 0 0 / 22px 22px, var(--bg)",
      }}
    >
      <div className="w-full max-w-4xl">
        <motion.header
          initial={reduceMotion ? false : { opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mb-6 flex items-baseline gap-2"
        >
          <span className="mono text-sm font-semibold" style={{ color: "var(--fg)" }}>
            interview_agent
          </span>
          <span className="mono text-xs" style={{ color: "var(--fg-dim)" }}>
            · AI Cohort · main
          </span>
        </motion.header>

        {stage.name === "select" && (
          <div className="rounded-xl border" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}>
            <CandidatePicker
              onSelect={(candidate) =>
                setStage({
                  name: "interview",
                  candidate,
                  sessionId: crypto.randomUUID(),
                })
              }
            />
          </div>
        )}

        {stage.name === "interview" && (
          <InterviewChat
            key={stage.sessionId}
            candidate={stage.candidate}
            sessionId={stage.sessionId}
            onComplete={(feedback) => setStage({ name: "done", candidate: stage.candidate, feedback })}
          />
        )}

        {stage.name === "done" && (
          <FeedbackReport
            candidate={stage.candidate}
            feedback={stage.feedback}
            onRestart={() => setStage({ name: "select" })}
          />
        )}

        <footer className="mt-8 text-center mono text-[11px]" style={{ color: "var(--fg-dim)" }}>
          Built for the ABTalks Vibe Code Hackathon · candidate & curriculum data are synthetic
        </footer>
      </div>
    </div>
  );
}
