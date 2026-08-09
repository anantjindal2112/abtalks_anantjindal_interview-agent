# AI Cohort Technical Interview Agent

A conversational AI that runs a real technical interview against a candidate's
actual cohort history — what they built, what they struggled with, what they
skipped — and produces structured, actionable feedback at the end.

Built for the Ab Talks Hackathon 2.0 against the spec in
[`../technical-spec.md`](../technical-spec.md).

## What it does

- Reads a candidate's `candidate.json` (missions passed/failed/skipped, attempt
  counts, commit-day signals) and builds a deterministic interview plan: a
  warmup → chronological-core → capstone sequence covering **at least 5
  distinct days**, weighted toward topics the candidate struggled with or
  skipped rather than an easy victory lap.
- Runs the interview as a real multi-turn conversation via a single LLM call
  per turn (Groq by default, Gemini as a swappable second provider — see
  [Reliability & resilience](#reliability--resilience)).
- **Code-enforced guardrails**, not left to the model's discretion:
  - **8–12 questions, ≥4 distinct days** — a floor *and* a ceiling. The model
    can never wrap up early (forced to keep going until the minimum is met)
    or drag on forever (hard-capped at 12; see `resolveAction()` in
    [`src/lib/guardrails.ts`](src/lib/guardrails.ts)).
  - **Skip handling has a real 2-strike rule.** Say "I don't know" once or
    twice on the same topic and the interview stays on it, asking a
    genuinely different question each time — never a reworded repeat. The
    *third* skip abandons the topic and **guarantees** it shows up as an
    explicit zero in the final feedback (`applyZeroedTopicPenalties()`),
    never silently averaged away.
  - A skip retry never inflates the question count — it replaces the
    question it's answering for, it doesn't add a new one.
  - "Don't just praise a wrong answer" is an explicit prompt rule, backed by
    a real per-turn assessment (correctness/depth 1–10) the model can't skip.
- Derives an adaptive difficulty score (1–5) and a decision label
  (`DEEPEN` / `CHALLENGE` / `CLARIFY` / `VERIFY_MISCONCEPTION` / `SWITCH_TOPIC`
  / `CONCLUDE`) per turn from the same call — no second LLM round-trip.
- Ends with structured feedback: a summary, strengths, gaps, next steps, five
  category scores, and any real misconceptions the candidate showed.
  **Category scores aren't just one LLM call's word** — they're reconciled
  against the real per-turn correctness/depth data already collected across
  the whole interview (`reconcileCategoryScores()` in
  [`src/lib/feedbackAccuracy.ts`](src/lib/feedbackAccuracy.ts)), pulling an
  inflated or hallucinated score back toward what actually happened, and
  deterministically filling scores in if the model omits them — never blank,
  never faked, never a second API call.
- **Bring your own candidate**, safely: paste a candidate.json-shaped payload
  into the picker's "advanced" panel and get field-level validation errors
  (not one generic message) plus a preview card before an interview — and an
  LLM call — actually starts. No candidate.json handy? A ready-made prompt in
  that same panel generates one from scratch for any LLM to fill in.

## Reliability & resilience

This was built assuming the free-tier keys behind it *will* get rate-limited
— the question was never "if," only "what happens when," and every layer
below exists so the answer is "it keeps working," never "it 500s":

| Layer | What happens |
|---|---|
| **Groq primary → backup key failover** | If the primary `GROQ_API_KEY` exhausts its retries on a 429/5xx, `groq.ts` automatically fails over to `GROQ_API_KEY_BACKUP` before giving up — roughly doubles real demo-day capacity with zero interview-logic changes. |
| **Gemini as a fully swappable second provider** | `groq.ts` and `gemini.ts` implement an identical interface over shared validation logic (`llm-shared.ts`); flip `LLM_PROVIDER=gemini` in `.env.local` and `route.ts` never knows the difference. |
| **Deterministic fallback, always** | If every provider call still fails, `fallbackTurn()`/`fallbackFeedback()` produce a plain, honest, on-contract response instead of erroring — the interview's guaranteed shape (8–12 questions, real feedback) never breaks, even with zero working API keys. |
| **A lightweight rate limiter of our own** | `checkRateLimit()` protects the shared quota from a runaway script or retry loop — not from a determined attacker (the spec requires no auth), just from accidentally burning the free tier in minutes. |
| **Session store that survives a different worker answering the next turn** | In-memory (fast, survives dev hot-reload) is the first tier, but on Vercel specifically, two requests five seconds apart can land on two completely separate serverless instances — memory (and even `/tmp`) isn't shared between them, which can make an in-progress interview "disappear" mid-conversation. Add the free Upstash-for-Redis integration (Vercel Marketplace, no card required) and `store.ts` picks up its env vars automatically — Redis becomes the real, shared source of truth. Without it, falls back to a disk-backed store (real persistence on a single long-lived process, e.g. local dev) which itself falls back to in-memory-only if even disk isn't writable. Every tier degrades, never crashes. See [`src/lib/store.ts`](src/lib/store.ts). |
| **300-run fuzz-tested control flow** | The guardrail engine (question caps, skip 2-strike rule, coverage minimums) is unit-tested against adversarial models and skip patterns in `scripts/test-guardrails.ts` — an actual infinite-loop bug was caught and fixed this way, not discovered live in front of a judge. Run it with `npm run test:guardrails`. |

### Recommended for the deployed Vercel URL: add free Redis

Without it, the app still works — it just inherits Vercel's normal serverless
trade-off (a different instance answering a later turn won't have the
earlier one in memory). Two minutes, free, no card:

1. Vercel dashboard → your project → **Storage** tab → **Create Database** →
   pick the Upstash **Redis** option (or add it from the Marketplace).
2. Connect it to this project. Vercel injects `KV_REST_API_URL` /
   `KV_REST_API_TOKEN` automatically — no copying secrets by hand.
3. Redeploy (or it redeploys itself). `store.ts` picks the new env vars up
   with zero code changes.

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
the picker screen — see [What it does](#what-it-does)) and start the interview.

### Environment variables

See [`.env.example`](.env.example) for the full list. At minimum you need one
provider's API key:

| Variable | Required | Notes |
|---|---|---|
| `GROQ_API_KEY` | yes, unless using Gemini | [console.groq.com](https://console.groq.com) |
| `GROQ_API_KEY_BACKUP` | no | automatic failover once the primary key's retries are exhausted — see [Reliability & resilience](#reliability--resilience) |
| `GEMINI_API_KEY` | only if `LLM_PROVIDER=gemini` | [aistudio.google.com](https://aistudio.google.com/apikey) |
| `GEMINI_MODEL` | no | defaults to `gemini-2.0-flash` |
| `LLM_PROVIDER` | no | `groq` (default) or `gemini` |

All free-tier — this project never requires a paid plan on any provider or host.

### Other scripts

```bash
npm run test:plan        # verifies the plan builder against all 20 bundled candidates
npm run test:guardrails  # 300-run fuzz test of the control-flow engine (no network calls)
npm run test             # both of the above
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

Non-contractual additions used only by this repo's own frontend (never
required or exercised by the graded contract, which only ever sends
`{sessionId, candidate}` or `{sessionId, message}`):

- `GET /api/interview?sessionId=` — live session progress + the per-turn
  evaluation trail, so the UI can render the roadmap/difficulty/judge-mode
  panels without a second LLM call.
- `{ sessionId, message, skipped: true }` — candidate skips a question instead
  of answering; see the 2-strike rule under [What it does](#what-it-does).
- `{ sessionId, endEarly: true }` — hidden testing escape hatch that ends the
  interview immediately; unreached topics are honestly counted as not-covered
  in the resulting feedback rather than hidden.

## Architecture

```
src/lib/
  types.ts             contract-matching types (mirrors candidate.json/curriculum.json exactly)
  data.ts              curriculum/candidate loaders
  plan.ts              deterministic interview plan + learning-map builder
  validateCandidate.ts field-level validation for a pasted candidate.json (UI-facing)
  guardrails.ts        the control-flow engine: question/day minimums, skip 2-strike rule,
                        difficulty, all pure and unit-tested (scripts/test-guardrails.ts)
  feedbackAccuracy.ts  grounds category scores against real per-turn evidence, no extra LLM call
  store.ts             two-tier session store (in-memory + disk, Vercel-/tmp/-aware)
  prompts.ts           system + per-turn + feedback prompt builders
  llm-shared.ts        provider-agnostic JSON validation/sanitization/fallback logic
  groq.ts               Groq provider (implements getNextTurn/getFeedback), primary+backup key failover
  gemini.ts             Gemini provider (same interface, swappable)
  llm.ts                env-gated switchboard — route.ts only ever imports this
  rateLimit.ts          lightweight quota protection, not auth
src/app/api/interview/
  route.ts              orchestration (the graded endpoint) — thin: delegates control flow to guardrails.ts
  records/route.ts       GET-only cohort insights aggregation (demo/BI bonus, not core product)
src/components/         frontend (chat, learning-map, roadmap trail, feedback report, judge mode, ...)
scripts/
  test-plan.ts           plan builder vs. all 20 bundled candidates
  test-guardrails.ts     300-run fuzz test of the control-flow engine, zero network calls
```

**Guardrail philosophy:** anything that must be reliable (question-count
minimums/ceiling, day coverage, skip consequences, category-score honesty,
"never fake a score") is resolved in code and unit-tested, never left to the
model's discretion. The LLM's structured output is validated field-by-field —
a malformed or missing field is dropped and degrades gracefully, never faked
and never allowed to break the interview's guaranteed shape.

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

- Cohort Insights (the `/records` leaderboard) is in-memory only — it resets
  on server restart. It's a demo/BI bonus, not core product, so this trade-off
  is deliberate.
- Interview session state is reliable across Vercel's separate serverless
  instances **once the free Redis integration is configured** (see
  [Reliability & resilience](#reliability--resilience)) — without it, it falls
  back to a disk store that only actually helps on a single long-lived
  process (local dev, or a real server/VM), not on Vercel specifically, where
  concurrent requests can hit different instances that don't share a
  filesystem.
- Groq's free tier caps at 8,000 input tokens/minute — long interviews or
  rapid parallel demo sessions can hit this; the app degrades to a
  deterministic fallback turn (or the backup key, then Gemini if configured)
  rather than erroring.
