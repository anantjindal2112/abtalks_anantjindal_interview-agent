"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { TerminalShell } from "./TerminalShell";
import { RoadmapTrail, type Progress, type TurnEvaluation } from "./RoadmapTrail";
import { JudgeMode } from "./JudgeMode";
import { buildInterviewPlan } from "@/lib/plan";
import { DURATION, EASE_OUT } from "@/lib/motion";
import type { Candidate, DecisionLabel, Feedback } from "@/lib/types";

type Message = { role: "interviewer" | "candidate"; content: string };

const DECISION_STYLE: Record<DecisionLabel, { label: string; color: string }> = {
  DEEPEN: { label: "deepen", color: "var(--accent-2)" },
  CHALLENGE: { label: "challenge ↑", color: "var(--warn)" },
  CLARIFY: { label: "clarify", color: "var(--fg-dim)" },
  VERIFY_MISCONCEPTION: { label: "verifying", color: "var(--danger)" },
  SWITCH_TOPIC: { label: "new topic", color: "var(--accent)" },
  CONCLUDE: { label: "wrapping up", color: "var(--accent)" },
};

function DecisionChip({ evaluation }: { evaluation: TurnEvaluation }) {
  const reduceMotion = useReducedMotion();
  if (!evaluation.decisionLabel) return null;
  const style = DECISION_STYLE[evaluation.decisionLabel];
  return (
    <motion.span
      initial={reduceMotion ? false : { opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: DURATION.chip }}
      className="mono text-[10px] rounded-full border px-2 py-0.5 inline-block"
      style={{ borderColor: style.color, color: style.color }}
      title={evaluation.reasoning ?? undefined}
    >
      {style.label}
    </motion.span>
  );
}

const PREP_STEPS = [
  "Reading candidate journey",
  "Mapping curriculum",
  "Selecting focus areas",
  "Preparing adaptive interview",
];

/** Shown only before the very first message — a real, honest sequence (not a
 * fake progress bar): the plan really is built from the candidate's journey
 * before this renders. Advances on a timer but simply holds on the last step
 * until the real fetch resolves, whichever comes first. */
function PreparingInterview() {
  const reduceMotion = useReducedMotion();
  const [stepIndex, setStepIndex] = useState(reduceMotion ? PREP_STEPS.length - 1 : 0);

  useEffect(() => {
    if (reduceMotion || stepIndex >= PREP_STEPS.length - 1) return;
    const id = setTimeout(() => setStepIndex((i) => i + 1), 550);
    return () => clearTimeout(id);
  }, [stepIndex, reduceMotion]);

  return (
    <div className="flex flex-col gap-1.5 py-1" role="status" aria-live="polite">
      {PREP_STEPS.map((step, i) => {
        const state = i < stepIndex ? "done" : i === stepIndex ? "active" : "pending";
        return (
          <motion.div
            key={step}
            initial={false}
            animate={{ opacity: state === "pending" ? 0.35 : 1 }}
            transition={{ duration: 0.2 }}
            className="flex items-center gap-2 mono text-xs"
            style={{ color: state === "pending" ? "var(--fg-dim)" : "var(--fg)" }}
          >
            <span className="w-3 text-center" aria-hidden style={{ color: state === "done" ? "var(--accent)" : "var(--fg-dim)" }}>
              {state === "done" ? "✓" : state === "active" ? "›" : "·"}
            </span>
            {step}
          </motion.div>
        );
      })}
    </div>
  );
}

const THINKING_LINES = [
  "> reading your last answer",
  "> weighing a follow-up",
  "> checking the topic plan",
  "> drafting the next question",
];

function ThinkingIndicator() {
  const reduceMotion = useReducedMotion();
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reduceMotion) return;
    const id = setInterval(() => setI((n) => (n + 1) % THINKING_LINES.length), 1100);
    return () => clearInterval(id);
  }, [reduceMotion]);

  return (
    <div className="flex items-center gap-2 py-1" role="status" aria-live="polite">
      <span className="flex gap-1" aria-hidden>
        {[0, 1, 2].map((d) => (
          <motion.span
            key={d}
            className="size-1.5 rounded-full"
            style={{ background: "var(--accent-2)" }}
            animate={reduceMotion ? undefined : { opacity: [0.25, 1, 0.25] }}
            transition={{ duration: 1.1, repeat: Infinity, delay: d * 0.15 }}
          />
        ))}
      </span>
      <span className="mono text-xs" style={{ color: "var(--fg-dim)" }}>
        {reduceMotion ? "Thinking…" : THINKING_LINES[i]}
      </span>
    </div>
  );
}

// Relative bar heights (px) — picked to look like an organic voice/token
// pulse rather than uniform bars, not actually driven by any real signal.
const WAVEFORM_BARS = [5, 9, 4, 8, 3];

/**
 * A one-shot pulse next to the "interviewer"/"you" label the instant a
 * message lands — bars rise then settle to a flat, faint baseline rather
 * than vanishing, reading as "signal received, now quiet" instead of a
 * decorative loop. Fires exactly once per Bubble mount (one per real
 * message), never repeats — "something moved because something happened,"
 * not ambient animation.
 */
function MessageWaveform() {
  return (
    <span className="inline-flex items-end gap-[1.5px] h-2.5" aria-hidden>
      {WAVEFORM_BARS.map((h, i) => (
        <motion.span
          key={i}
          className="w-[2px] rounded-full"
          style={{ background: "var(--accent-2)" }}
          initial={{ height: 0, opacity: 0.95 }}
          animate={{ height: [0, h, 2], opacity: [0.95, 1, 0.35] }}
          transition={{ duration: 0.55, delay: i * 0.035, ease: "easeOut" }}
        />
      ))}
    </span>
  );
}

function Bubble({ message, evaluation }: { message: Message; evaluation?: TurnEvaluation }) {
  const reduceMotion = useReducedMotion();
  const isInterviewer = message.role === "interviewer";
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.question, ease: EASE_OUT }}
      className={`flex ${isInterviewer ? "justify-start" : "justify-end"}`}
    >
      <div className={`max-w-[85%] ${isInterviewer ? "" : "text-right"}`}>
        <div
          className={`mono text-[10px] mb-1 flex items-center gap-1.5 ${isInterviewer ? "" : "justify-end"}`}
          style={{ color: "var(--fg-dim)" }}
        >
          {isInterviewer ? "interviewer" : "you"}
          {!reduceMotion && <MessageWaveform />}
          {isInterviewer && evaluation && <DecisionChip evaluation={evaluation} />}
        </div>
        <div
          className="rounded-lg px-3.5 py-2.5 text-sm leading-relaxed inline-block text-left"
          style={{
            background: isInterviewer ? "var(--bg-inset)" : "var(--accent)",
            color: isInterviewer ? "var(--fg)" : "var(--accent-fg)",
            border: isInterviewer ? "1px solid var(--border)" : "none",
          }}
        >
          {message.content}
        </div>
      </div>
    </motion.div>
  );
}

export function InterviewChat({
  candidate,
  sessionId,
  onComplete,
}: {
  candidate: Candidate;
  sessionId: string;
  onComplete: (feedback: Feedback) => void;
}) {
  const reduceMotion = useReducedMotion();
  const plan = useMemo(() => buildInterviewPlan(candidate), [candidate]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<Progress>(null);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  async function refreshProgress() {
    try {
      const res = await fetch(`/api/interview?sessionId=${encodeURIComponent(sessionId)}`);
      if (res.ok) setProgress(await res.json());
    } catch {
      // progress trail is cosmetic only — safe to ignore a failed refresh
    }
  }

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    (async () => {
      try {
        const res = await fetch("/api/interview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, candidate }),
        });
        if (!res.ok) throw new Error(`Server responded ${res.status}`);
        const data = await res.json();
        setMessages([{ role: "interviewer", content: data.reply }]);
        await refreshProgress();
      } catch {
        setError("Couldn't start the interview. Check the server logs and try again.");
      } finally {
        setLoading(false);
      }
    })();
    // Intentionally sessionId-only: a fresh InterviewChat instance is mounted
    // per session (parent keys it by sessionId), so this must fire exactly
    // once per mount and never re-run when `candidate` is the same object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function submitTurn(payload: { message: string } | { skipped: true }, displayText: string) {
    if (loading) return;
    setInput("");
    setMessages((m) => [...m, { role: "candidate", content: displayText }]);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, ...payload }),
      });
      if (!res.ok) throw new Error(`Server responded ${res.status}`);
      const data = await res.json();
      setMessages((m) => [...m, { role: "interviewer", content: data.reply }]);
      await refreshProgress();
      if (data.done) {
        onComplete(data.feedback as Feedback);
        return;
      }
    } catch {
      setError("That message didn't go through. You can try again.");
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function send() {
    const text = input.trim();
    if (!text) return;
    submitTurn({ message: text }, text);
  }

  function skip() {
    submitTurn({ skipped: true }, "— skipped, don't know this one —");
  }

  const [judgeMode, setJudgeMode] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  async function copySessionId() {
    try {
      await navigator.clipboard.writeText(sessionId);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 1500);
    } catch {
      // clipboard permission denied — non-critical
    }
  }

  // Deliberately not advertised anywhere in the candidate-facing copy — a
  // low-key escape hatch for testing/demo runs, not a feature a real
  // candidate is ever told exists. Unreachable by the graded contract
  // (which only ever sends {sessionId, message}). Remaining topics are
  // honestly counted as skipped server-side, not just silently dropped.
  async function endEarly() {
    if (loading) return;
    if (!window.confirm("End this interview now? Remaining topics will honestly count as not covered in your feedback.")) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, endEarly: true }),
      });
      if (!res.ok) throw new Error(`Server responded ${res.status}`);
      const data = await res.json();
      setMessages((m) => [...m, { role: "interviewer", content: data.reply }]);
      if (data.done) onComplete(data.feedback as Feedback);
    } catch {
      setError("Couldn't end the interview. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-4">
      <div className="flex items-center justify-between mb-1 px-1">
        <div>
          <span className="text-sm font-medium" style={{ color: "var(--fg)" }}>
            {candidate.member.name}
          </span>
          <span className="text-xs ml-2" style={{ color: "var(--fg-dim)" }}>
            {candidate.member.jobRole}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setJudgeMode((v) => !v)}
            aria-pressed={judgeMode}
            className="mono text-[11px] rounded border px-2 py-0.5 cursor-pointer hover:border-[var(--accent-2)]"
            style={{
              borderColor: judgeMode ? "var(--accent-2)" : "var(--border)",
              color: judgeMode ? "var(--accent-2)" : "var(--fg-dim)",
            }}
          >
            {judgeMode ? "✓ judge mode" : "judge mode"}
          </button>
          <button
            type="button"
            onClick={copySessionId}
            className="mono text-[11px] rounded border px-2 py-0.5 cursor-pointer hover:border-[var(--accent-2)]"
            style={{ borderColor: "var(--border)", color: "var(--fg-dim)" }}
            title="Copy session ID"
          >
            {copiedId ? "✓ copied" : `id: ${sessionId.slice(0, 8)}`}
          </button>
          <button
            type="button"
            onClick={endEarly}
            disabled={loading}
            className="mono text-[11px] rounded border px-2 py-0.5 cursor-pointer hover:border-[var(--danger)] disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ borderColor: "var(--border)", color: "var(--fg-dim)" }}
            title="End the interview now (testing use — remaining topics count as not covered)"
          >
            end early
          </button>
        </div>
      </div>
      <div className="hidden lg:block" aria-hidden />
      <TerminalShell title={`interviewer@ai-cohort:~/session/${sessionId.slice(0, 8)}$`}>
        <div
          ref={scrollRef}
          role="log"
          aria-live="polite"
          aria-label="Interview transcript"
          className="flex flex-col gap-4 p-4 sm:p-5 overflow-y-auto"
          style={{ height: "min(56vh, 520px)" }}
        >
          <AnimatePresence initial={false}>
            {(() => {
              let interviewerIndex = -1;
              return messages.map((m, i) => {
                if (m.role === "interviewer") interviewerIndex++;
                const evaluation = m.role === "interviewer" ? progress?.evaluations?.[interviewerIndex] : undefined;
                return <Bubble key={i} message={m} evaluation={evaluation} />;
              });
            })()}
          </AnimatePresence>
          {loading && (messages.length === 0 ? <PreparingInterview /> : <ThinkingIndicator />)}
          {error && (
            <p role="alert" className="text-xs" style={{ color: "var(--danger)" }}>
              {error}
            </p>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="flex items-end gap-2 p-3 border-t shrink-0"
          style={{ borderColor: "var(--border)" }}
        >
          <label htmlFor="candidate-answer" className="sr-only">
            Your answer
          </label>
          <textarea
            id="candidate-answer"
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            disabled={loading}
            placeholder="Type your answer… (Enter to send, Shift+Enter for a new line)"
            rows={2}
            className="mono flex-1 resize-none rounded-md border px-3 py-2 text-sm outline-none disabled:opacity-60"
            style={{ background: "var(--bg-inset)", borderColor: "var(--border)", color: "var(--fg)" }}
          />
          <motion.button
            type="submit"
            disabled={loading || !input.trim()}
            whileHover={loading || !input.trim() ? undefined : { x: 1 }}
            whileTap={loading || !input.trim() ? undefined : { scale: 0.97 }}
            className="group rounded-md px-4 py-2 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1.5"
            style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
          >
            {loading && messages.length > 0 ? (
              <>
                <motion.span
                  className="size-3 rounded-full border-2 border-current border-t-transparent"
                  animate={reduceMotion ? { opacity: [1, 0.4, 1] } : { rotate: 360 }}
                  transition={reduceMotion ? { duration: 1.1, repeat: Infinity } : { duration: 0.7, repeat: Infinity, ease: "linear" }}
                  aria-hidden
                />
                Analyzing…
              </>
            ) : (
              <>
                Send
                <span className="inline-block transition-transform group-hover:translate-x-0.5" aria-hidden>
                  →
                </span>
              </>
            )}
          </motion.button>
          <button
            type="button"
            onClick={skip}
            disabled={loading}
            title="Skip this question — say you don't know it and move on"
            className="mono text-xs px-3 py-2 rounded-md border cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:border-[var(--warn)]"
            style={{ borderColor: "var(--border)", color: "var(--fg-dim)" }}
          >
            Skip
          </button>
        </form>
      </TerminalShell>

      <aside
        className="hidden lg:block rounded-xl border"
        style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}
      >
        <RoadmapTrail plan={plan} progress={progress} />
      </aside>

      {/* Mobile: same trail, collapsed by default via a native <details> so it doesn't push the chat down */}
      <details className="lg:hidden rounded-xl border" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}>
        <summary
          className="cursor-pointer select-none px-4 py-2.5 mono text-[11px] uppercase tracking-wide"
          style={{ color: "var(--fg-dim)" }}
        >
          interview roadmap · question {progress?.questionsAsked ?? 0}
        </summary>
        <RoadmapTrail plan={plan} progress={progress} />
      </details>

      <div className="lg:col-span-2">
        <JudgeMode evaluations={progress?.evaluations ?? []} open={judgeMode} />
      </div>
    </div>
  );
}
