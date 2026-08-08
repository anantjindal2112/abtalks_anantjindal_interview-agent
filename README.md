# AI Cohort Technical Interview Agent

A conversational AI that runs a real technical interview against a candidate's
actual cohort history — what they built, what they struggled with, what they
skipped — and produces structured, actionable feedback at the end.

Built for the Ab Talks Hackathon 2.0 against the spec in
[`../technical-spec.md`](../technical-spec.md).

## What it does

- Reads a candidate's `candidate.json` (missions passed/failed/skipped, attempt
  counts, commit-day signals) and builds a deterministic interview plan: a
  warmup → chronological-core → capstone sequence covering **at least 6
  distinct days**, weighted toward topics the candidate struggled with or
  skipped rather than an easy victory lap.
- Runs the interview as a real multi-turn conversation via a single LLM call
  per turn (Groq by default, Gemini as a swappable second provider — see
  [Switching LLM providers](#switching-llm-providers)).
- **Code-enforced guardrails**, not left to the model's discretion: the
  ≥8-question / ≥4-distinct-day minimum, follow-up caps, and the "don't just
  praise a wrong answer" rule are resolved in `route.ts`/`prompts.ts`, so a bad
  LLM turn can never break the interview's shape.
- Derives an adaptive difficulty score (1-5) and a decision label
  (`DEEPEN` / `CHALLENGE` / `CLARIFY` / `VERIFY_MISCONCEPTION` / `SWITCH_TOPIC`
  / `CONCLUDE`) per turn from the same call — no second LLM round-trip.
- Ends with structured feedback: a summary, strengths, gaps, next steps, five
  category scores, and any real misconceptions the candidate showed — never
  fabricated; fields the model didn't confidently return are simply omitted.

## Tech stack

Next.js 16 (App Router, Turbopack) · TypeScript · Tailwind CSS 4 ·
Framer Motion · Groq SDK · `@google/genai` (Gemini)

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in at least GROQ_API_KEY
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Pick a bundled candidate
(or paste your own `candidate.json`-shaped payload via the "advanced" panel on
the picker screen) and start the interview.

### Environment variables

See [`.env.example`](.env.example) for the full list. At minimum you need one
provider's API key:

| Variable | Required | Notes |
|---|---|---|
| `GROQ_API_KEY` | yes, unless using Gemini | [console.groq.com](https://console.groq.com) |
| `GROQ_API_KEY_BACKUP` | no | unused fallback slot for a second Groq key |
| `GEMINI_API_KEY` | only if `LLM_PROVIDER=gemini` | [aistudio.google.com](https://aistudio.google.com/apikey) |
| `GEMINI_MODEL` | no | defaults to `gemini-2.0-flash` |
| `LLM_PROVIDER` | no | `groq` (default) or `gemini` |

### Other scripts

```bash
npm run test:plan   # verifies the plan builder against all 20 bundled candidates
npm run lint
npx tsc --noEmit
```

## API contract

A single endpoint, no auth, state keyed by `sessionId` — see
[`../technical-spec.md`](../technical-spec.md) for the full spec.

```
POST /api/interview
```

**Start:** `{ sessionId, candidate }` → `{ reply, done: false }`
**Turn:** `{ sessionId, message }` → `{ reply, done: false }`
**End:** → `{ reply, done: true, feedback: { summary, strengths, gaps, next } }`

Two non-contractual additions used only by this repo's own frontend (never
required or exercised by the graded contract, which only ever sends
`{sessionId, candidate}` or `{sessionId, message}`):

- `GET /api/interview?sessionId=` — live session progress + the per-turn
  evaluation trail, so the UI can render the roadmap/difficulty/judge-mode
  panels without a second LLM call.
- `{ sessionId, message, skipped: true }` — candidate skips a question instead
  of answering; 2nd+ skip applies a guaranteed difficulty penalty in code.
- `{ sessionId, endEarly: true }` — hidden testing escape hatch that ends the
  interview immediately; unreached topics are honestly counted as not-covered
  in the resulting feedback rather than hidden.

## Architecture

```
src/lib/
  types.ts       contract-matching types (mirrors candidate.json/curriculum.json exactly)
  data.ts        curriculum/candidate loaders
  plan.ts        deterministic interview plan + learning-map builder
  store.ts       in-memory session store (globalThis-backed, survives dev HMR)
  prompts.ts     system + per-turn + feedback prompt builders
  llm-shared.ts  provider-agnostic JSON validation/sanitization/fallback logic
  groq.ts        Groq provider (implements getNextTurn/getFeedback)
  gemini.ts      Gemini provider (same interface, swappable)
  llm.ts         env-gated switchboard — route.ts only ever imports this
src/app/api/interview/
  route.ts       orchestration + guardrails (the graded endpoint)
  records/route.ts  GET-only cohort insights aggregation (demo/BI bonus, not core product)
src/components/  frontend (chat, learning-map, roadmap trail, feedback report, judge mode, ...)
```

**Guardrail philosophy:** anything that must be reliable (question-count
minimums, day coverage, skip penalties, "never fake a score") is resolved in
code. The LLM's structured output is validated field-by-field — a malformed
or missing field is dropped and degrades gracefully, never faked and never
allowed to break the interview's guaranteed shape.

## Switching LLM providers

Default is Groq. To use Gemini instead, set in `.env.local`:

```
LLM_PROVIDER=gemini
GEMINI_API_KEY=...
```

`groq.ts` and `gemini.ts` implement an identical exported interface
(`getNextTurn`/`getFeedback`) over the same shared validation logic in
`llm-shared.ts`; `route.ts` imports only from `llm.ts` and never knows which
provider is actually answering.

> **Note:** a fresh/free-tier Gemini API key's project may come provisioned
> with a `0` free-tier quota for `generativelanguage.googleapis.com` until
> billing/quota is set up in Google AI Studio — you'll see `429
> RESOURCE_EXHAUSTED` in the server logs (as `[gemini] ... falling back:`) and
> the app will transparently drop to the deterministic fallback rather than
> break. Groq is the provider that's been live-tested across dozens of real
> interview turns this project; treat it as primary.

## Known limitations

- Session state and Cohort Insights are in-memory only — they reset on
  server restart. Fine for a demo, not for production.
- Groq's free tier caps at 8,000 input tokens/minute — long interviews or
  rapid parallel demo sessions can hit this; the app degrades to a
  deterministic fallback turn rather than erroring.
