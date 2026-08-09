// Unit tests for the provider-agnostic JSON validation/sanitization/fallback
// logic in src/lib/llm-shared.ts — the safety net BOTH providers (groq.ts,
// gemini.ts) share for "never fake a score, never let a malformed model
// response break the interview." Pure functions, zero network calls.
import type { SessionState, TranscriptTurn } from "../src/lib/types";
import {
  fallbackFeedback,
  fallbackTurn,
  isFeedback,
  isTurnDecision,
  recentTranscript,
  safeParseJson,
  sanitizeFeedback,
  sanitizeTurnDecision,
} from "../src/lib/llm-shared";

let failures = 0;
function check(cond: boolean, label: string, detail?: string) {
  if (!cond) {
    failures++;
    console.log(`   !!! FAIL: ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    console.log(`   ok: ${label}`);
  }
}

// --- safeParseJson ---------------------------------------------------------
console.log("--- safeParseJson ---");
check(safeParseJson<{ a: number }>('{"a":1}')?.a === 1, "parses plain JSON");
check(safeParseJson<{ a: number }>('```json\n{"a":1}\n```')?.a === 1, "strips ```json fences");
check(safeParseJson<{ a: number }>("```\n{\"a\":1}\n```")?.a === 1, "strips bare ``` fences");
check(safeParseJson("not json at all") === null, "returns null on invalid JSON, never throws");
check(safeParseJson("") === null, "returns null on empty string");

// --- isTurnDecision / sanitizeTurnDecision ---------------------------------
console.log("\n--- isTurnDecision ---");
check(isTurnDecision({ action: "follow_up", reply: "hi" }), "accepts minimal valid decision");
check(!isTurnDecision({ action: "follow_up", reply: "" }), "rejects empty reply");
check(!isTurnDecision({ action: "follow_up", reply: "   " }), "rejects whitespace-only reply");
check(!isTurnDecision({ action: "bogus_action", reply: "hi" }), "rejects invalid action");
check(!isTurnDecision({ reply: "hi" }), "rejects missing action");
check(!isTurnDecision(null), "rejects null");
check(!isTurnDecision("a string"), "rejects non-object");

console.log("\n--- sanitizeTurnDecision ---");
{
  const clean = sanitizeTurnDecision({ action: "follow_up", reply: "hi", decision: "DEEPEN" });
  check(clean.decision === "DEEPEN", "keeps a valid decision label");
}
{
  const dirty = sanitizeTurnDecision({ action: "follow_up", reply: "hi", decision: "MADE_UP_LABEL" as never });
  check(dirty.decision === undefined, "drops an invalid decision label rather than faking one");
}
{
  const longReasoning = "x".repeat(500);
  const truncated = sanitizeTurnDecision({ action: "follow_up", reply: "hi", reasoning: longReasoning });
  check(truncated.reasoning?.length === 300, "truncates reasoning to 300 chars", `got ${truncated.reasoning?.length}`);
}
{
  const clamped = sanitizeTurnDecision({
    action: "follow_up",
    reply: "hi",
    assessment: { correctness: 55, depth: -3, missingConcepts: ["a", 5, "b"] as never, misconception: null },
  });
  check(clamped.assessment?.correctness === 10, "clamps correctness to max 10", String(clamped.assessment?.correctness));
  check(clamped.assessment?.depth === 1, "clamps depth to min 1", String(clamped.assessment?.depth));
  check(
    JSON.stringify(clamped.assessment?.missingConcepts) === JSON.stringify(["a", "b"]),
    "filters non-string entries out of missingConcepts"
  );
}
{
  const missingFields = sanitizeTurnDecision({ action: "follow_up", reply: "hi", assessment: { correctness: 5 } as never });
  check(missingFields.assessment === undefined, "drops assessment entirely if a required field is missing (never half-fakes it)");
}
{
  const nullAssessment = sanitizeTurnDecision({ action: "next_topic", reply: "hi", assessment: null });
  check(nullAssessment.assessment === null, "preserves explicit null assessment (valid on the opening turn)");
}

// --- fallbackTurn (never-breaks-the-interview path) -------------------------
console.log("\n--- fallbackTurn ---");
function makeSession(planLength: number, planIndex: number): SessionState {
  const plan = Array.from({ length: planLength }, (_, i) => ({
    day: i + 1,
    title: `Topic ${i + 1}`,
    bucket: "confident" as const,
    mission: null,
    curriculumDay: null,
    reason: "test",
    angle: "test",
  }));
  return {
    sessionId: "t",
    candidate: {
      member: { id: "T-1", name: "Test Candidate", jobRole: "Engineer", yearsExperience: 1, education: "N/A", status: "COMPLETED" },
      missions: [],
      signals: { commitDays: 0, missionsCompleted: 0, missionsFirstTry: 0 },
    },
    plan,
    planIndex,
    followUpsOnCurrentTopic: 0,
    transcript: [],
    questionsAsked: planIndex + 1,
    daysCovered: plan.slice(0, planIndex + 1).map((p) => p.day),
    phase: "core",
    difficulty: 2,
    skipCount: 0,
    skipsOnCurrentTopic: 0,
    zeroedTopics: [],
    createdAt: 0,
  };
}
{
  const opening = fallbackTurn(makeSession(6, 0), true);
  check(opening.action === "next_topic", "opening fallback always starts with next_topic");
  check(opening.reply.includes("Test"), "opening fallback greets the candidate by name");
}
{
  const midPlan = fallbackTurn(makeSession(6, 2), false);
  check(midPlan.action === "next_topic", "mid-plan fallback advances to the next topic");
  check(midPlan.reply.includes("Topic 4"), "mid-plan fallback names the actual next topic", midPlan.reply);
}
{
  const exhausted = fallbackTurn(makeSession(6, 5), false); // planIndex === plan.length - 1
  check(exhausted.action === "conclude", "fallback concludes once the plan is exhausted, never crashes on an out-of-range topic");
}

// --- isFeedback / sanitizeFeedback ------------------------------------------
console.log("\n--- isFeedback / sanitizeFeedback ---");
check(isFeedback({ summary: "s", strengths: [], gaps: [], next: [] }), "accepts minimal valid feedback");
check(!isFeedback({ summary: "s", strengths: [], gaps: [] }), "rejects feedback missing a required field (next)");
check(!isFeedback({ summary: "s", strengths: ["ok", 5], gaps: [], next: [] }), "rejects a non-string entry in strengths");
{
  const scored = sanitizeFeedback({
    summary: "s",
    strengths: [],
    gaps: [],
    next: [],
    categoryScores: { technicalKnowledge: 150, engineeringReasoning: -20, systemDesign: 55.6, communication: 70, productionAwareness: 80 },
  });
  check(scored.categoryScores?.technicalKnowledge === 100, "clamps categoryScores above 100");
  check(scored.categoryScores?.engineeringReasoning === 0, "clamps categoryScores below 0");
  check(scored.categoryScores?.systemDesign === 56, "rounds fractional categoryScores", String(scored.categoryScores?.systemDesign));
}
{
  const incomplete = sanitizeFeedback({
    summary: "s",
    strengths: [],
    gaps: [],
    next: [],
    categoryScores: { technicalKnowledge: 80 } as never, // missing the other 4 keys
  });
  check(incomplete.categoryScores === undefined, "drops categoryScores entirely if any key is missing (never half-fakes a score)");
}
{
  const withMisconceptions = sanitizeFeedback({
    summary: "s",
    strengths: [],
    gaps: [],
    next: [],
    misconceptions: ["real one", 42, "another", "c", "d", "e", "overflow"] as never,
  });
  check(withMisconceptions.misconceptions?.length === 5, "caps misconceptions at 5 and drops non-strings", JSON.stringify(withMisconceptions.misconceptions));
}

console.log("\n--- fallbackFeedback ---");
{
  const s = makeSession(6, 5);
  s.plan[0].bucket = "confident";
  s.plan[1].bucket = "struggled";
  s.plan[2].bucket = "skipped";
  const fb = fallbackFeedback(s);
  check(fb.summary.includes("Test Candidate"), "fallback feedback summary names the candidate");
  check(fb.strengths.some((x) => x.includes("Topic 1")), "fallback strengths reference a real confident-bucket topic");
  check(fb.gaps.some((x) => x.includes("Topic 2")), "fallback gaps reference a real struggled-bucket topic");
  check(fb.next.some((x) => x.includes("Topic 3")), "fallback next-steps reference a real skipped-bucket topic");
}

// --- recentTranscript --------------------------------------------------------
console.log("\n--- recentTranscript ---");
{
  const short: TranscriptTurn[] = Array.from({ length: 4 }, (_, i) => ({ role: i % 2 === 0 ? "interviewer" : "candidate", content: `${i}` }));
  check(recentTranscript(short).length === 4, "returns the whole transcript unchanged when under the window");
}
{
  const long: TranscriptTurn[] = Array.from({ length: 20 }, (_, i) => ({ role: i % 2 === 0 ? "interviewer" : "candidate", content: `${i}` }));
  const windowed = recentTranscript(long);
  check(windowed.length <= 12, "bounds a long transcript to the recent window", String(windowed.length));
  check(windowed[0]?.role === "candidate", "trims a dangling leading interviewer turn so the window opens on the candidate's side");
}

console.log(failures === 0 ? "\nAll llm-shared invariants held." : `\n${failures} llm-shared invariant violation(s) FAILED.`);
if (failures > 0) process.exitCode = 1;
