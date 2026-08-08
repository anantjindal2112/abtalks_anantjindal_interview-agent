"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Hero } from "@/components/Hero";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CandidatePicker } from "@/components/CandidatePicker";
import { CandidateIntelligence } from "@/components/CandidateIntelligence";
import { InterviewChat } from "@/components/InterviewChat";
import { FeedbackReport } from "@/components/FeedbackReport";
import type { Candidate, Feedback } from "@/lib/types";

type Stage =
  | { name: "select" }
  | { name: "profile"; candidate: Candidate }
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
          className="mb-6 flex items-baseline justify-between gap-2"
        >
          <div className="flex items-baseline gap-2">
            <button
              type="button"
              className="mono text-sm font-semibold cursor-pointer"
              style={{ color: "var(--fg)" }}
              onClick={() => setStage({ name: "select" })}
            >
              interview_agent
            </button>
            <span className="mono text-xs" style={{ color: "var(--fg-dim)" }}>
              · AI Cohort · main
            </span>
          </div>
          <ThemeToggle />
        </motion.header>

        {stage.name === "select" && <Hero />}

        <AnimatePresence mode="wait">
          {stage.name === "select" && (
            <motion.div
              key="select"
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="rounded-xl border"
              style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}
            >
              <CandidatePicker onSelect={(candidate) => setStage({ name: "profile", candidate })} />
            </motion.div>
          )}

          {stage.name === "profile" && (
            <motion.div
              key={`profile-${stage.candidate.member.id}`}
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <CandidateIntelligence
                candidate={stage.candidate}
                onBack={() => setStage({ name: "select" })}
                onBegin={() =>
                  setStage({ name: "interview", candidate: stage.candidate, sessionId: crypto.randomUUID() })
                }
              />
            </motion.div>
          )}

          {stage.name === "interview" && (
            <motion.div
              key={stage.sessionId}
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <InterviewChat
                candidate={stage.candidate}
                sessionId={stage.sessionId}
                onComplete={(feedback) => setStage({ name: "done", candidate: stage.candidate, feedback })}
              />
            </motion.div>
          )}

          {stage.name === "done" && (
            <motion.div
              key="done"
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <FeedbackReport
                candidate={stage.candidate}
                feedback={stage.feedback}
                onRestart={() => setStage({ name: "select" })}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <footer className="mt-8 text-center mono text-[11px]" style={{ color: "var(--fg-dim)" }}>
          Built for the ABTalks Vibe Code Hackathon · candidate & curriculum data are synthetic
        </footer>
      </div>
    </div>
  );
}
