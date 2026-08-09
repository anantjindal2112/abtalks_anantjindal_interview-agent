// Unit tests for the actual production control-flow engine in
// src/lib/guardrails.ts — no HTTP, no LLM, no network. Every scenario below
// drives applyResolvedTurn() (the exact function route.ts calls on every
// turn) with a synthetic "model" and synthetic skip decisions, then asserts
// the invariants the whole interview contract depends on:
//   - MIN_QUESTIONS <= final questionsAsked <= HARD_QUESTION_CAP, always
//   - daysCovered.length >= MIN_DAYS at conclude, always
//   - a topic is only ever zeroed after 3+ skips on it, never fewer
//   - skip retries (1st/2nd skip) never advance planIndex or inflate the count
//   - every simulated interview actually terminates (no infinite loop)
import type { CurriculumDay, PlanTopic, SessionState } from "../src/lib/types";
import type { TurnDecision } from "../src/lib/llm-shared";
import {
  applyResolvedTurn,
  HARD_QUESTION_CAP,
  INITIAL_DIFFICULTY,
  MAX_SKIPS_PER_TOPIC,
  MIN_DAYS,
  MIN_QUESTIONS,
} from "../src/lib/guardrails";

let failures = 0;
function check(cond: boolean, label: string, detail?: string) {
  if (!cond) {
    failures++;
    console.log(`   !!! FAIL: ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function makeCurriculumDay(n: number): CurriculumDay {
  return {
    day: n,
    title: `Topic ${n}`,
    type: "BUILD",
    tools: ["tool"],
    objectives: [`objective A for topic ${n}`, `objective B for topic ${n}`],
  };
}

function makePlan(n: number): PlanTopic[] {
  return Array.from({ length: n }, (_, i) => ({
    day: i + 1,
    title: `Topic ${i + 1}`,
    bucket: "confident" as const,
    mission: null,
    curriculumDay: makeCurriculumDay(i + 1),
    reason: "synthetic test topic",
    angle: "a test angle",
  }));
}

function makeSession(planLength: number): SessionState {
  const plan = makePlan(planLength);
  return {
    sessionId: "test",
    candidate: {
      member: { id: "T-1", name: "Test Candidate", jobRole: "Engineer", yearsExperience: 1, education: "N/A", status: "COMPLETED" },
      missions: [],
      signals: { commitDays: 0, missionsCompleted: 0, missionsFirstTry: 0 },
    },
    plan,
    planIndex: 0,
    followUpsOnCurrentTopic: 0,
    transcript: [],
    // Mirrors real route.ts state right after the opening question: one
    // question already asked, one day already covered.
    questionsAsked: 1,
    daysCovered: [plan[0].day],
    phase: "warmup",
    difficulty: INITIAL_DIFFICULTY,
    skipCount: 0,
    skipsOnCurrentTopic: 0,
    zeroedTopics: [],
    createdAt: 0,
  };
}

type Policy = (session: SessionState, turn: number) => { modelAction: TurnDecision["action"]; isSkip: boolean };

function runInterview(planLength: number, policy: Policy, maxTurns = 200) {
  const session = makeSession(planLength);
  const skipsPerDay = new Map<number, number>();
  let turns = 0;
  while (session.phase !== "done") {
    turns++;
    if (turns > maxTurns) {
      throw new Error(`did not terminate within ${maxTurns} turns (planLength=${planLength})`);
    }
    const { modelAction, isSkip } = policy(session, turns);
    if (isSkip) {
      session.skipCount += 1;
      session.skipsOnCurrentTopic += 1;
      const day = session.plan[session.planIndex].day;
      skipsPerDay.set(day, (skipsPerDay.get(day) ?? 0) + 1);
    }
    const decision: TurnDecision = {
      action: modelAction,
      reply: isSkip ? "(skip-turn reply)" : `reply for turn ${turns}`,
      assessment: isSkip
        ? { correctness: 1, depth: 1, missingConcepts: [], misconception: null }
        : { correctness: 6, depth: 6, missingConcepts: [], misconception: null },
    };
    session.transcript.push({ role: "candidate", content: isSkip ? "(skip)" : "(answer)" });
    // A GENUINE skip retry (1st/2nd skip on this topic) is decided by
    // skipsOnCurrentTopic alone, mirroring guardrails.ts's own skipRetryIntent
    // — NOT "isSkip && action === follow_up" in general, which also matches
    // the emergency-valve case (3rd+ skip on the last topic, forced back to
    // follow_up because there's nowhere else to go) where the question DOES
    // have to count, or the interview could never reach MIN_QUESTIONS.
    const genuineSkipRetryCandidate = isSkip && session.skipsOnCurrentTopic <= MAX_SKIPS_PER_TOPIC;
    const before = session.questionsAsked;
    const beforePlanIndex = session.planIndex;
    const { action } = applyResolvedTurn(session, decision, isSkip);
    if (genuineSkipRetryCandidate && action === "follow_up") {
      check(session.questionsAsked === before, "skip retry must not inflate questionsAsked", `turn ${turns}`);
      check(session.planIndex === beforePlanIndex, "skip retry must not advance planIndex", `turn ${turns}`);
    }
  }
  return { session, turns, skipsPerDay };
}

function report(label: string, planLength: number, policy: Policy) {
  const { session, turns, skipsPerDay } = runInterview(planLength, policy);
  console.log(
    `${label} (plan=${planLength}) -> turns=${turns} questionsAsked=${session.questionsAsked} days=${session.daysCovered.length} zeroed=${session.zeroedTopics.length}`
  );
  check(
    session.questionsAsked >= MIN_QUESTIONS && session.questionsAsked <= HARD_QUESTION_CAP,
    `${label}: questionsAsked within [${MIN_QUESTIONS}, ${HARD_QUESTION_CAP}]`,
    `got ${session.questionsAsked}`
  );
  check(session.daysCovered.length >= Math.min(MIN_DAYS, planLength), `${label}: daysCovered >= MIN_DAYS`, `got ${session.daysCovered.length}`);
  // No duplicate zeroedTopics entries for the same day (the emergency-valve
  // re-flag bug this test was written to catch).
  const zeroedDays = session.zeroedTopics.map((t) => t.day);
  check(new Set(zeroedDays).size === zeroedDays.length, `${label}: no duplicate zeroedTopics entries`, JSON.stringify(zeroedDays));
  // Every zeroed topic really was skipped 3+ times.
  for (const t of session.zeroedTopics) {
    check((skipsPerDay.get(t.day) ?? 0) >= MAX_SKIPS_PER_TOPIC + 1, `${label}: zeroed day ${t.day} actually had 3+ skips`);
  }
  return session;
}

console.log("--- scenario: adversarial model, always tries to conclude immediately ---");
report("always-conclude", 6, () => ({ modelAction: "conclude", isSkip: false }));
report("always-conclude", 4, () => ({ modelAction: "conclude", isSkip: false }));

console.log("\n--- scenario: adversarial model, never follows up (always next_topic) ---");
report("always-next-topic", 6, () => ({ modelAction: "next_topic", isSkip: false }));
report("always-next-topic", 4, () => ({ modelAction: "next_topic", isSkip: false }));

console.log("\n--- scenario: candidate skips every single question ---");
{
  const session = report("always-skip", 6, () => ({ modelAction: "next_topic", isSkip: true }));
  // With 6 topics all skip-abandoned, every topic except possibly the last
  // (which may need extra emergency-valve turns to hit the minimum) should
  // end up zeroed.
  check(session.zeroedTopics.length >= session.plan.length - 1, "always-skip: nearly every topic gets zeroed", `got ${session.zeroedTopics.length}/${session.plan.length}`);
}
report("always-skip", 4, () => ({ modelAction: "next_topic", isSkip: true }));

console.log("\n--- scenario: candidate skips exactly twice per topic, then answers ---");
{
  const session = report("skip-twice-then-answer", 6, (s) => {
    const skipsSoFar = s.skipsOnCurrentTopic;
    if (skipsSoFar < MAX_SKIPS_PER_TOPIC) return { modelAction: "next_topic", isSkip: true }; // model wants to move on; code should override to follow_up
    return { modelAction: "next_topic", isSkip: false }; // then a real answer, model moves on
  });
  check(session.zeroedTopics.length === 0, "skip-twice-then-answer: no topic ever gets zeroed (never crosses the 3-skip line)");
}

console.log("\n--- scenario: fuzz — random model + random skip decisions ---");
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}
const rand = seededRandom(42);
const ACTIONS: TurnDecision["action"][] = ["follow_up", "next_topic", "conclude"];
let fuzzRuns = 0;
for (let i = 0; i < 300; i++) {
  const planLength = 4 + Math.floor(rand() * 5); // 4-8
  const skipChance = rand() * 0.6; // some runs barely skip, some skip a lot
  try {
    report(`fuzz#${i}`, planLength, () => ({
      modelAction: ACTIONS[Math.floor(rand() * ACTIONS.length)],
      isSkip: rand() < skipChance,
    }));
    fuzzRuns++;
  } catch (err) {
    failures++;
    console.log(`   !!! FAIL: fuzz#${i} (plan=${planLength}) threw: ${(err as Error).message}`);
  }
}
console.log(`fuzz: ${fuzzRuns}/300 runs completed without throwing`);

console.log(failures === 0 ? "\nAll guardrail invariants held." : `\n${failures} guardrail invariant violation(s) FAILED.`);
if (failures > 0) process.exitCode = 1;
