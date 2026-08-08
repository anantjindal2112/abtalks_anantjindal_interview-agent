"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { TerminalShell } from "./TerminalShell";
import { RoadmapTrail, type Progress } from "./RoadmapTrail";
import { buildInterviewPlan } from "@/lib/plan";
import { DURATION, EASE_OUT } from "@/lib/motion";
import type { Candidate, Feedback } from "@/lib/types";

type Message = { role: "interviewer" | "candidate"; content: string };

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

function Bubble({ message }: { message: Message }) {
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
        <div className="mono text-[10px] mb-1" style={{ color: "var(--fg-dim)" }}>
          {isInterviewer ? "interviewer" : "you"}
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

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setMessages((m) => [...m, { role: "candidate", content: text }]);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message: text }),
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
      setError("That message didn't go through. You can try sending it again.");
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

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
        <button
          type="button"
          onClick={copySessionId}
          className="mono text-[11px] rounded border px-2 py-0.5 cursor-pointer hover:border-[var(--accent-2)]"
          style={{ borderColor: "var(--border)", color: "var(--fg-dim)" }}
          title="Copy session ID"
        >
          {copiedId ? "✓ copied" : `id: ${sessionId.slice(0, 8)}`}
        </button>
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
            {messages.map((m, i) => (
              <Bubble key={i} message={m} />
            ))}
          </AnimatePresence>
          {loading && <ThinkingIndicator />}
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
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="rounded-md px-4 py-2 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
          >
            Send
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
    </div>
  );
}
