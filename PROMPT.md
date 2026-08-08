# AI Usage Log — AI Interview Agent

Format: **Prompt** → **Did**. Entries added as work happens, not reconstructed after the fact.

---

## 1. Initial handoff & architecture proposal

**Prompt:** Full problem-statement handoff for the "AI Interview Agent" track (ABTalks Vibe Code Hackathon). Instructed: read `curriculum.json` (31-day cohort curriculum), `candidates.json` (20 synthetic candidate profiles), and `technical-spec.md` (exact API contract for `POST /api/interview`) before writing any code; propose a session/state architecture and interview-flow logic; stop for review before building. Design bar: animation-heavy, coding-themed UI, real accessibility.

**Did:** Read all three resource files in full. Proposed: Next.js (App Router) app with an in-memory `globalThis`-backed session Map keyed by `sessionId` (explicitly a hackathon-demo simplification); a deterministic, code-driven interview plan builder that reads each candidate's real `missions` (bucketed into confident / struggled / failed / skipped by attempts and pass state) to pick 5–6 anchor topics across ≥5 distinct curriculum days; a per-turn Groq LLM call in JSON mode that decides `follow_up` / `next_topic` / `conclude`, with the ≥8-questions/≥4-days minimum and a follow-up/total-question cap **enforced in code**, not left to LLM discretion; a final Groq call producing the structured `{summary, strengths, gaps, next}` feedback. Presented the plan and stopped for review.

## 2. Groq billing concern

**Prompt:** User asked (twice, worried about surprise charges) for reassurance that using their free Groq API key would not result in a bill — confirmed understanding that it would only fail (rate-limited), not charge, unless they explicitly added a paid plan.

**Did:** Explained Groq's free-tier model accurately (no card on file = structurally impossible to be billed; free tier just 429s on rate limit), pointed them to `console.groq.com/settings/billing` to verify for their own account, and confirmed their understanding was correct. No code changes.

## 3. Where to put the API key

**Prompt:** User asked where to put their Groq key; approved starting the build ("okay where to put the key tell me").

**Did:** Scaffolded the actual project — `npx create-next-app` (TypeScript, Tailwind, App Router, `src/` dir) at `interview-agent/`. Verified `.env*` is git-ignored by the default template. Created `interview-agent/.env.local` with a `GROQ_API_KEY=` placeholder. Copied `curriculum.json` and `candidates.json` into `src/data/`. Installed `groq-sdk`.

## 4. Couldn't open `.env.local`

**Prompt:** User couldn't open `.env.local` (macOS hides dotfiles by default).

**Did:** Gave `open -e`/`code` terminal one-liners and the Finder `Cmd+Shift+.` shortcut to reveal dotfiles. No code changes.

## 5. Key dropped in — proceed to build

**Prompt:** User confirmed the key was pasted into `.env.local` ("kardiya").

**Did:** Committed the scaffold + data + dependency as an incremental commit. Created this log file for real (see note above the log — a prior claim of having created it was inaccurate and is being corrected here). Proceeding to build: types/data loader, session store, interview plan builder, Groq client + prompts, the `/api/interview` route, and the frontend, committing incrementally per phase.

## 6. Core backend build (types → plan builder → Groq → API route)

**Prompt:** (implicit, continuing the confirmed architecture) Build the session/state layer, the deterministic interview plan builder, the Groq integration, and the `POST /api/interview` route.

**Did:** Read `node_modules/next/dist/docs/` per this repo's `AGENTS.md` warning (Next.js 16.3.0, newer than training data) before writing route handlers — confirmed the App Router `route.ts` POST/GET convention is unchanged. Built: `src/lib/types.ts` (contract-matching types), `src/lib/data.ts` (curriculum/candidate loaders), `src/lib/store.ts` (`globalThis`-backed in-memory session Map, survives dev HMR), `src/lib/plan.ts` (deterministic plan builder — bucket missions into confident/struggled/failed/skipped, pick 6 anchor topics across distinct days, warmup→chronological-core→capstone ordering), `src/lib/prompts.ts` + `src/lib/groq.ts` (JSON-mode Groq calls with retry/backoff and deterministic fallbacks), `src/app/api/interview/route.ts` (orchestration with code-enforced guardrails — the ≥8-question/≥4-day minimum and follow-up/total caps are resolved in code via `resolveAction`, not left to the LLM). Verified the plan builder against all 20 bundled candidates via `scripts/test-plan.ts` (all clear 6/6 distinct days). Smoke-tested the full API against the live Groq key across a real 13-turn interview. Committed in two chunks (lib layer, then the route).

## 7. Interactive, animation-heavy frontend

**Prompt:** "bhai iske liye ham abhi interactive page bhi banayege? interaction and motion heavy and animation heavy and cool stuff" — confirming the frontend should be built now, motion-heavy per the original design bar.

**Did:** Added a `GET /api/interview?sessionId=` endpoint to the same route file (not part of the graded contract — purely for the frontend to read live session progress without duplicating guardrail logic client-side). Installed `framer-motion`. Rebuilt `globals.css` with a terminal/git-diff-inspired theme (dark-first, explicit light override, CSS vars, `prefers-reduced-motion` handling, always-visible `:focus-visible` rings). Built components: `TerminalShell` (window-chrome wrapper), `CandidatePicker` (20 bundled candidates as cards with a mission-outcome bar), `InterviewChat` (chat log with `role="log" aria-live="polite"`, animated message bubbles, a cycling "thinking" indicator for the real 5–30s Groq latency, a live `RoadmapTrail` sidebar synced via the new GET endpoint), `FeedbackReport` (git-diff-styled +/!/→ strengths/gaps/next panel). Wired together in `page.tsx` as a 3-stage state machine.

Verified in-browser (not just by reading code): full flow end-to-end for two different candidates (Sarah Johnson — mixed struggled/skipped; Emily Chen — all first-try, which exercises the emergency-follow-up guardrail path since 6 clean topics alone would undershoot 8 questions). Checked: dark and light theme contrast ratios computed programmatically (all pairs ≥4.5:1, most 5.5–16:1), keyboard focus-visible rings, `aria-live` regions. Found and diagnosed that the browser-automation tool's synthetic "Return" keypress carries no `key`/`keyCode` (confirmed via an injected event listener) — a limitation of that specific tool, not the app; real keyboards send `key: "Enter"` which the handler already checks, and the Send button path was verified working end-to-end. Fixed two lint warnings (unused var in `plan.ts`, misplaced `eslint-disable` in `InterviewChat.tsx`) before committing.

## 8. "Crazy", hack-level-professional polish pass

**Prompt:** "bhai iska interface crazy banade... this look look heck level professional" — asking for a fuller, more feature-rich, more premium-feeling frontend rather than just a working chat widget. Followed shortly by: "jab AI interviewer question puche toh thoda animation aaye uske baad question aaye toh better dikhega" (want a visible reveal animation before/as each question appears).

**Did:** Added `Hero.tsx` (typed-command headline + 4-feature grid, landing-page feel above the candidate picker), `ThemeToggle.tsx` (persisted light/dark override, independent of system preference), an "advanced: bring your own candidate.json" collapsible on `CandidatePicker` (lets a technical reviewer paste any candidate.json-shaped payload and start an interview with it directly — a live, low-effort way to probe the API contract's flexibility from the UI itself), export buttons on `FeedbackReport` (copy-as-Markdown, download-.md), a live progress bar + hover/tap micro-interactions, and a per-word typewriter reveal on interviewer messages (`TypewriterText`, capped total duration, skipped under reduced motion) so each question visibly "types in" rather than appearing instantly.

**Mid-build correction:** initially added a blocking pre-hydration `<script>` (via `next/script` `strategy="beforeInteractive"`) to kill any theme flash-of-wrong-content. It fought this Next.js version's script-hoisting internals — console showed a real, reproducible error ("Script is not defined") plus a hydration-mismatch warning. Diagnosed by reading `next/script`'s actual client implementation in `node_modules`, confirmed the browser was serving a genuinely stale cached bundle from an earlier broken edit (cleared `.next` and hard-reloaded to confirm), then made the deliberate call to **not** chase the zero-flash version — reverted to a simple post-mount `useEffect` theme sync (a sub-100ms flash on first load, no hydration risk, no fighting the framework). Chose the robust-and-simple path over the fancy-but-fragile one.

**Budget correction:** user flagged the Groq key is on a **45-requests/24h** free-tier limit, and the two earlier full test interviews (Isabella, 13 turns; Emily, 12 turns) had already spent a meaningful chunk of it. Stopped running live interview turns for verification from this point on — all further checks in this phase (theme toggle, advanced-JSON collapsible, console-error audits) were done as static page loads / interactions that never call `/api/interview`, and the typewriter-reveal component was verified by code review + typecheck/lint rather than a live run, since it reuses the same message-rendering path already proven live in the two earlier interviews.
