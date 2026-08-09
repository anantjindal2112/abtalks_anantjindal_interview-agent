"use client";

import { useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { sampleCandidates } from "@/lib/data";
import { summarizeCandidate } from "@/lib/plan";
import { validateCandidateJson } from "@/lib/validateCandidate";
import type { Candidate } from "@/lib/types";

const BUCKET_LABEL: Record<string, string> = {
  confident: "passed first-try",
  struggled: "multiple attempts",
  failed: "not passed",
  skipped: "skipped",
};

const PROFILE_LABEL: Record<string, string> = {
  confident: "mostly first-try",
  struggled: "earned it the hard way",
  failed: "rough patches",
  skipped: "selective",
};

// Paste-into-any-LLM template for generating a valid candidate.json from
// scratch — the advanced panel's "no candidate.json handy" escape hatch.
// Kept in sync with the Candidate type in src/lib/types.ts by hand (small
// enough surface that a generated-from-schema step would be overkill here).
const CANDIDATE_JSON_PROMPT = `Generate ONE fake candidate profile as a single JSON object for a fictional graduate of "The AI Cohort", a 31-day enterprise AI engineering bootcamp (RAG, vector databases, prompt engineering, agentic AI, MCP, production AI deployment).

Output ONLY the JSON object — no markdown fences, no commentary — matching exactly this shape:

{
  "member": {
    "id": "CAND-XXX",
    "name": "Full Name",
    "jobRole": "their day job, e.g. Backend Engineer",
    "yearsExperience": <number>,
    "education": "e.g. BS Computer Science",
    "status": "COMPLETED"
  },
  "missions": [
    { "day": <1-31>, "title": "short mission title", "passed": true, "attempts": <1-5> }
    // one entry per curriculum day they attempted — mix outcomes realistically:
    // some { "passed": true, "attempts": 1 } (easy pass), some with "attempts": 3+
    // (struggled), some { "passed": false } (failed), some { "skipped": true }
  ],
  "signals": {
    "commitDays": <number of distinct days they were active>,
    "missionsCompleted": <count of missions with passed:true>,
    "missionsFirstTry": <count of missions with passed:true and attempts:1>
  }
}

Cover at least 20-25 of the 31 days, with a believable mix of confident passes, struggled-but-passed, failed, and skipped missions — not all-perfect and not all-failing. Make the numbers in "signals" actually consistent with the "missions" array you generate.`;

function CopyPromptButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          setCopied(false);
        }
      }}
      className="mono text-[10px] rounded px-2 py-1 border cursor-pointer shrink-0"
      style={{ borderColor: "var(--border)", color: "var(--fg-dim)" }}
    >
      {copied ? "copied ✓" : "copy prompt"}
    </button>
  );
}

const BUCKET_SEGMENTS: Array<[string, string]> = [
  ["confident", "var(--accent)"],
  ["struggled", "var(--warn)"],
  ["failed", "var(--danger)"],
  ["skipped", "var(--skip)"],
];

function dominantBucket(counts: Record<string, number>): string {
  return Object.entries(counts).reduce((best, [k, v]) => (v > (counts[best] ?? -1) ? k : best), "confident");
}

function BucketBar({ candidate, animate }: { candidate: Candidate; animate: boolean }) {
  const counts = summarizeCandidate(candidate);
  const total = Math.max(1, candidate.missions.length);
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--bg-inset)" }}>
      {BUCKET_SEGMENTS.map(([key, color]) =>
        counts[key as keyof typeof counts] > 0 ? (
          <motion.span
            key={key}
            initial={animate ? { width: 0 } : false}
            animate={{ width: `${(counts[key as keyof typeof counts] / total) * 100}%` }}
            transition={{ duration: 0.5, delay: 0.15, ease: "easeOut" }}
            style={{ background: color }}
            title={`${counts[key as keyof typeof counts]} ${BUCKET_LABEL[key]}`}
          />
        ) : null
      )}
    </div>
  );
}

/**
 * A cursor-tracked spotlight + gentle 3D tilt — plain mouse-move state, no
 * framer-motion springs needed. Reduced-motion candidates get a flat card
 * with none of this (handleMove/reset just never fire).
 */
function CandidateCard({
  candidate,
  index,
  reduceMotion,
  onSelect,
}: {
  candidate: Candidate;
  index: number;
  reduceMotion: boolean | null;
  onSelect: (c: Candidate) => void;
}) {
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, mx: 50, my: 50, active: false });
  const frame = useRef<number | null>(null);

  function handleMove(e: React.MouseEvent<HTMLButtonElement>) {
    if (reduceMotion) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      setTilt({ rx: (0.5 - py) * 8, ry: (px - 0.5) * 8, mx: px * 100, my: py * 100, active: true });
    });
  }
  function resetTilt() {
    setTilt((t) => ({ ...t, rx: 0, ry: 0, active: false }));
  }

  const counts = summarizeCandidate(candidate);
  const profile = PROFILE_LABEL[dominantBucket(counts)];

  return (
    <motion.li
      initial={reduceMotion ? false : { opacity: 0, y: 14, rotateX: -10 }}
      animate={{ opacity: 1, y: 0, rotateX: 0 }}
      transition={{ delay: reduceMotion ? 0 : index * 0.05, duration: 0.35, ease: "easeOut" }}
      style={{ perspective: 700 }}
    >
      <button
        type="button"
        onClick={() => onSelect(candidate)}
        onMouseMove={handleMove}
        onMouseLeave={resetTilt}
        className="w-full text-left rounded-lg border p-4 cursor-pointer relative overflow-hidden focus-visible:border-[var(--accent-2)]"
        style={{
          background: "var(--bg-inset)",
          borderColor: tilt.active ? "var(--accent-2)" : "var(--border)",
          transform: `perspective(700px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg) translateZ(0) ${
            tilt.active ? "scale(1.015)" : "scale(1)"
          }`,
          transition: tilt.active ? "border-color 150ms ease-out, box-shadow 150ms ease-out" : "transform 300ms ease-out, border-color 200ms ease-out, box-shadow 200ms ease-out",
          boxShadow: tilt.active ? "var(--shadow), 0 8px 20px -8px rgba(0,0,0,0.25)" : "var(--shadow)",
        }}
      >
        {!reduceMotion && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200"
            style={{
              opacity: tilt.active ? 1 : 0,
              background: `radial-gradient(220px circle at ${tilt.mx}% ${tilt.my}%, color-mix(in srgb, var(--accent-2) 12%, transparent), transparent 70%)`,
            }}
          />
        )}
        <div className="relative">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-medium text-sm" style={{ color: "var(--fg)" }}>
              {candidate.member.name}
            </span>
            <span className="mono text-[11px]" style={{ color: "var(--fg-dim)" }}>
              {candidate.member.id}
            </span>
          </div>
          <div className="text-xs mt-0.5 flex items-center gap-1.5 flex-wrap" style={{ color: "var(--fg-dim)" }}>
            <span>
              {candidate.member.jobRole} · {candidate.member.yearsExperience}y exp
            </span>
            <span
              className="mono text-[9px] rounded-full border px-1.5 py-0.5"
              style={{ borderColor: "var(--border)", color: "var(--fg-dim)" }}
            >
              {profile}
            </span>
          </div>
          <div className="mt-3">
            <BucketBar candidate={candidate} animate={!reduceMotion} />
            <div className="mt-1.5 flex justify-between mono text-[10px]" style={{ color: "var(--fg-dim)" }}>
              <span>{candidate.signals.missionsCompleted} missions</span>
              <span>{candidate.signals.commitDays} commit days</span>
              <span>{candidate.signals.missionsFirstTry} first-try</span>
            </div>
          </div>
        </div>
      </button>
    </motion.li>
  );
}

/**
 * Shown after a pasted candidate.json passes validation, before it's
 * actually used to start an interview (and spend an LLM call) — a chance to
 * eyeball that the data parsed the way the author intended (right name,
 * plausible mission mix) rather than discovering a typo mid-interview.
 */
function CandidatePreviewCard({
  candidate,
  onConfirm,
  onBack,
}: {
  candidate: Candidate;
  onConfirm: () => void;
  onBack: () => void;
}) {
  const counts = summarizeCandidate(candidate);
  const profile = PROFILE_LABEL[dominantBucket(counts)];
  return (
    <div className="mt-3 rounded-lg border p-4" style={{ borderColor: "var(--accent-2)", background: "var(--bg-inset)" }}>
      <p className="mono text-[10px] uppercase tracking-wide" style={{ color: "var(--accent-2)" }}>
        preview — nothing started yet
      </p>
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <span className="font-medium text-sm" style={{ color: "var(--fg)" }}>
          {candidate.member.name}
        </span>
        <span className="mono text-[11px]" style={{ color: "var(--fg-dim)" }}>
          {candidate.member.id}
        </span>
      </div>
      <div className="text-xs mt-0.5 flex items-center gap-1.5 flex-wrap" style={{ color: "var(--fg-dim)" }}>
        <span>
          {candidate.member.jobRole} · {candidate.member.yearsExperience}y exp
        </span>
        <span className="mono text-[9px] rounded-full border px-1.5 py-0.5" style={{ borderColor: "var(--border)", color: "var(--fg-dim)" }}>
          {profile}
        </span>
      </div>
      <div className="mt-3">
        <BucketBar candidate={candidate} animate={false} />
        <div className="mt-1.5 flex justify-between mono text-[10px]" style={{ color: "var(--fg-dim)" }}>
          <span>{candidate.missions.length} missions parsed</span>
          <span>{candidate.signals.commitDays} commit days</span>
          <span>{candidate.signals.missionsFirstTry} first-try</span>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onConfirm}
          className="rounded-md px-3 py-1.5 text-xs font-medium cursor-pointer"
          style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
        >
          Looks right — start interview
        </button>
        <button
          type="button"
          onClick={onBack}
          className="rounded-md border px-3 py-1.5 text-xs font-medium cursor-pointer"
          style={{ borderColor: "var(--border)", color: "var(--fg-dim)" }}
        >
          Back to edit
        </button>
      </div>
    </div>
  );
}

export function CandidatePicker({ onSelect }: { onSelect: (candidate: Candidate) => void }) {
  const reduceMotion = useReducedMotion();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [jsonInput, setJsonInput] = useState("");
  const [jsonErrors, setJsonErrors] = useState<string[]>([]);
  const [preview, setPreview] = useState<Candidate | null>(null);

  function submitCustomCandidate() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonInput);
    } catch {
      setJsonErrors(["That's not valid JSON."]);
      setPreview(null);
      return;
    }
    const result = validateCandidateJson(parsed);
    if (!result.valid) {
      setJsonErrors(result.errors);
      setPreview(null);
      return;
    }
    setJsonErrors([]);
    setPreview(result.candidate);
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
          <CandidateCard key={candidate.member.id} candidate={candidate} index={i} reduceMotion={reduceMotion} onSelect={onSelect} />
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
            <div className="rounded-md border p-3" style={{ borderColor: "var(--border)", background: "var(--bg-inset)" }}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs" style={{ color: "var(--fg-dim)" }}>
                  Don&apos;t have a candidate.json handy? Copy this prompt into ChatGPT, Claude, or any LLM — paste
                  what it gives you into the box below.
                </p>
                <CopyPromptButton text={CANDIDATE_JSON_PROMPT} />
              </div>
              <pre className="mono mt-2 max-h-28 overflow-y-auto whitespace-pre-wrap text-[10px] leading-relaxed" style={{ color: "var(--fg-dim)" }}>
                {CANDIDATE_JSON_PROMPT}
              </pre>
            </div>

            <details className="mt-3 text-xs" style={{ color: "var(--fg-dim)" }}>
              <summary className="cursor-pointer mono text-[11px]" style={{ color: "var(--fg)" }}>
                required fields, if you&apos;re writing it by hand
              </summary>
              <ul className="mt-2 flex flex-col gap-1 pl-4 list-disc mono text-[10px] leading-relaxed">
                <li><code>member.id</code>, <code>member.name</code>, <code>member.jobRole</code>, <code>member.yearsExperience</code>, <code>member.education</code>, <code>member.status</code> — all required strings/number</li>
                <li><code>missions[]</code> — at least one entry, each with <code>day</code> (1-31) and <code>title</code>; then one of <code>passed: true</code>, <code>passed: false</code>, or <code>skipped: true</code>, plus <code>attempts</code> (number, omit for skipped)</li>
                <li><code>signals.commitDays</code>, <code>signals.missionsCompleted</code>, <code>signals.missionsFirstTry</code> — all numbers</li>
              </ul>
            </details>

            <label htmlFor="candidate-json-input" className="sr-only">
              Candidate JSON
            </label>
            <textarea
              id="candidate-json-input"
              value={jsonInput}
              onChange={(e) => {
                setJsonInput(e.target.value);
                if (preview) setPreview(null); // editing after a confirmed preview invalidates it
              }}
              placeholder='{"member": {...}, "missions": [...], "signals": {...}}'
              rows={4}
              className="mono mt-3 w-full resize-y rounded-md border px-3 py-2 text-xs outline-none"
              style={{ background: "var(--bg-inset)", borderColor: "var(--border)", color: "var(--fg)" }}
            />
            {jsonErrors.length > 0 && (
              <ul role="alert" className="mt-1.5 flex flex-col gap-0.5 text-xs" style={{ color: "var(--danger)" }}>
                {jsonErrors.map((e, i) => (
                  <li key={i}>· {e}</li>
                ))}
              </ul>
            )}
            {!preview && (
              <button
                type="button"
                onClick={submitCustomCandidate}
                disabled={!jsonInput.trim()}
                className="mt-2 rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
              >
                Validate &amp; preview
              </button>
            )}
            {preview && (
              <CandidatePreviewCard candidate={preview} onConfirm={() => onSelect(preview)} onBack={() => setPreview(null)} />
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}
