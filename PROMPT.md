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
