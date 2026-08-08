// Shapes mirror curriculum.json / candidates.json exactly — do not "improve" them,
// the grading harness sends candidate.json objects as-is.

export type CurriculumDay = {
  day: number;
  title: string;
  type: "SETUP" | "BUILD" | "LEARN" | "AI_CORE" | "OPTIMIZE" | "SHIP_IT" | "CAPSTONE";
  tools: string[];
  objectives: string[];
};

export type CurriculumModule = {
  n: number;
  title: string;
  days: [number, number];
};

export type Curriculum = {
  cohort: string;
  modules: CurriculumModule[];
  days: CurriculumDay[];
};

export type Mission = {
  day: number;
  title: string;
  passed?: boolean;
  skipped?: boolean;
  attempts?: number;
};

export type CandidateMember = {
  id: string;
  name: string;
  jobRole: string;
  yearsExperience: number;
  education: string;
  status: string;
};

export type CandidateSignals = {
  commitDays: number;
  missionsCompleted: number;
  missionsFirstTry: number;
};

export type Candidate = {
  member: CandidateMember;
  missions: Mission[];
  signals: CandidateSignals;
};

// --- Interview plan -------------------------------------------------------

export type MissionBucket = "confident" | "struggled" | "failed" | "skipped";

export type PlanTopic = {
  day: number;
  title: string;
  bucket: MissionBucket;
  mission: Mission | null; // null only for the generic-curriculum fallback path
  curriculumDay: CurriculumDay | null; // null if the day isn't in curriculum.json
  reason: string; // short human-readable rationale, also fed to the LLM as context
  angle: string; // randomized framing hint so the same topic isn't asked the same way twice
};

export type InterviewPhase = "warmup" | "core" | "capstone" | "done";

// --- Answer assessment + adaptive decision -----------------------------------
// All optional/best-effort: this rides along on the SAME single per-turn Groq
// call that already decides follow_up/next_topic/conclude — never a second
// LLM call. If the model omits it or it fails validation, everything downstream
// degrades gracefully (no assessment shown, difficulty stays put) rather than
// blocking the interview. Never fabricated in the frontend — only ever rendered
// from what the model actually returned for that specific turn.

export type Assessment = {
  correctness: number; // 1-10, of the candidate's most recent answer
  depth: number; // 1-10
  missingConcepts: string[];
  misconception: string | null;
};

export const DECISION_LABELS = [
  "DEEPEN",
  "CHALLENGE",
  "CLARIFY",
  "SWITCH_TOPIC",
  "VERIFY_MISCONCEPTION",
  "CONCLUDE",
] as const;
export type DecisionLabel = (typeof DECISION_LABELS)[number];

// --- Conversation -----------------------------------------------------------

export type TurnRole = "interviewer" | "candidate";

export type TranscriptTurn = {
  role: TurnRole;
  content: string;
  // present on interviewer turns that asked a question
  meta?: {
    day: number;
    topicTitle: string;
    isFollowUp: boolean;
    assessment?: Assessment; // evaluation of the answer that led to THIS turn
    reasoning?: string; // short rationale for why this question/action was chosen
    decisionLabel?: DecisionLabel;
    difficulty?: number; // 1-5, current level after this decision
  };
};

export type SessionState = {
  sessionId: string;
  candidate: Candidate;
  plan: PlanTopic[];
  planIndex: number;
  followUpsOnCurrentTopic: number;
  transcript: TranscriptTurn[];
  questionsAsked: number;
  daysCovered: number[];
  phase: InterviewPhase;
  difficulty: number; // 1-5, adjusted from assessment signal each turn
  skipCount: number; // candidate-initiated "I don't know" skips; 2nd+ forces a difficulty penalty in code
  createdAt: number;
  feedback?: Feedback; // cached once the interview concludes, so repeat calls don't re-generate
};

// --- API contract (must match technical-spec.md exactly) --------------------

export type StartRequestBody = {
  sessionId: string;
  candidate: Candidate;
};

export type TurnRequestBody = {
  sessionId: string;
  message: string;
};

export type InterviewRequestBody = StartRequestBody | TurnRequestBody;

export type CategoryScores = {
  technicalKnowledge: number; // 0-100
  engineeringReasoning: number;
  systemDesign: number;
  communication: number;
  productionAwareness: number;
};

export type Feedback = {
  summary: string;
  strengths: string[];
  gaps: string[];
  next: string[];
  // Best-effort, optional — same single feedback call, not a second one.
  // Rendered only when present; nothing downstream assumes they exist.
  categoryScores?: CategoryScores;
  misconceptions?: string[];
};

export type InterviewResponse =
  | { reply: string; done: false }
  | { reply: string; done: true; feedback: Feedback };
