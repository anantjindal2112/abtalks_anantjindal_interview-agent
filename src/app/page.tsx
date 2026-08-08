"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { DURATION, EASE_OUT } from "@/lib/motion";
import { Hero } from "@/components/Hero";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CandidatePicker } from "@/components/CandidatePicker";
import { CandidateIntelligence } from "@/components/CandidateIntelligence";
import { InterviewChat } from "@/components/InterviewChat";
import { FeedbackReport } from "@/components/FeedbackReport";
import type { TurnEvaluation } from "@/components/RoadmapTrail";
import sampleInterviewRaw from "@/data/sample-interview.json";
import type { Candidate, Feedback } from "@/lib/types";

// A real, previously-captured completed interview (David Miller, CAND-004) —
// not fabricated — used only for the "view a sample" demo entry point so
// judges can see the full report instantly without spending a live Groq call
// or waiting through a 10-13 question interview.
const SAMPLE_CANDIDATE = sampleInterviewRaw.candidate as Candidate;
const SAMPLE_FEEDBACK = sampleInterviewRaw.feedback as Feedback;
const SAMPLE_EVALUATIONS = sampleInterviewRaw.evaluations as unknown as TurnEvaluation[];

type Stage =
  | { name: "select" }
  | { name: "profile"; candidate: Candidate }
  | { name: "interview"; candidate: Candidate; sessionId: string }
  | { name: "done"; candidate: Candidate; sessionId: string; feedback: Feedback; sampleEvaluations?: TurnEvaluation[] };

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
          <div className="flex items-center gap-3">
            <Link href="/records" className="mono text-xs hover:underline" style={{ color: "var(--fg-dim)" }}>
              cohort insights →
            </Link>
            <ThemeToggle />
          </div>
        </motion.header>

        {stage.name === "select" && (
          <Hero
            onViewSample={() =>
              setStage({
                name: "done",
                candidate: SAMPLE_CANDIDATE,
                sessionId: "sample",
                feedback: SAMPLE_FEEDBACK,
                sampleEvaluations: SAMPLE_EVALUATIONS,
              })
            }
          />
        )}

        <AnimatePresence mode="wait">
          {stage.name === "select" && (
            <motion.div
              key="select"
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
              transition={{ duration: DURATION.page, ease: EASE_OUT }}
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
              exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
              transition={{ duration: DURATION.page, ease: EASE_OUT }}
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
              exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
              transition={{ duration: DURATION.page, ease: EASE_OUT }}
            >
              <InterviewChat
                candidate={stage.candidate}
                sessionId={stage.sessionId}
                onComplete={(feedback) =>
                  setStage({ name: "done", candidate: stage.candidate, sessionId: stage.sessionId, feedback })
                }
              />
            </motion.div>
          )}

          {stage.name === "done" && (
            <motion.div
              key="done"
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
              transition={{ duration: DURATION.page, ease: EASE_OUT }}
            >
              {stage.sampleEvaluations && (
                <div
                  className="mb-3 mono text-[11px] rounded-md border px-3 py-2"
                  style={{ borderColor: "var(--accent-2)", color: "var(--accent-2)", background: "var(--bg-elevated)" }}
                >
                  ◆ Sample report — a real, previously-completed interview, shown instantly for demo purposes.
                </div>
              )}
              <FeedbackReport
                candidate={stage.candidate}
                feedback={stage.feedback}
                sessionId={stage.sessionId}
                sampleEvaluations={stage.sampleEvaluations}
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
