// Field-level validation for a user-submitted candidate.json payload (the
// CandidatePicker "advanced: bring your own candidate.json" flow). The API
// route's own isCandidate() check stays deliberately loose (member + missions
// present — the graded contract shouldn't reject anything reasonable); this
// is the stricter, UI-facing version that gives a human editing JSON by hand
// specific, actionable errors instead of a single generic "missing
// member/missions" message, and a real preview before committing Groq spend
// to an interview built from garbage data (e.g. day numbers outside 1-31,
// which would silently fail to match curriculum.json and degrade question
// quality without ever surfacing why).
import type { Candidate, Mission } from "./types";

export type ValidationResult = { valid: true; candidate: Candidate } | { valid: false; errors: string[] };

function isNonEmptyString(x: unknown): x is string {
  return typeof x === "string" && x.trim().length > 0;
}

function validateMission(m: unknown, index: number, errors: string[]): m is Mission {
  if (!m || typeof m !== "object") {
    errors.push(`missions[${index}] must be an object.`);
    return false;
  }
  const mission = m as Record<string, unknown>;
  let ok = true;
  if (typeof mission.day !== "number" || !Number.isInteger(mission.day) || mission.day < 1 || mission.day > 31) {
    errors.push(`missions[${index}].day must be a whole number from 1 to 31 (curriculum only covers 31 days).`);
    ok = false;
  }
  if (!isNonEmptyString(mission.title)) {
    errors.push(`missions[${index}].title must be a non-empty string.`);
    ok = false;
  }
  const hasSkipped = "skipped" in mission;
  const hasPassed = "passed" in mission;
  if (!hasSkipped && !hasPassed) {
    errors.push(`missions[${index}] needs either "skipped": true or a "passed": true/false — outcome is ambiguous without one.`);
    ok = false;
  }
  if (hasSkipped && typeof mission.skipped !== "boolean") {
    errors.push(`missions[${index}].skipped must be a boolean.`);
    ok = false;
  }
  if (hasPassed && typeof mission.passed !== "boolean") {
    errors.push(`missions[${index}].passed must be a boolean.`);
    ok = false;
  }
  if ("attempts" in mission && (typeof mission.attempts !== "number" || mission.attempts < 1)) {
    errors.push(`missions[${index}].attempts, if present, must be a number >= 1.`);
    ok = false;
  }
  return ok;
}

export function validateCandidateJson(x: unknown): ValidationResult {
  const errors: string[] = [];
  if (!x || typeof x !== "object") {
    return { valid: false, errors: ["Top-level value must be a JSON object."] };
  }
  const c = x as Record<string, unknown>;

  if (!c.member || typeof c.member !== "object") {
    errors.push('"member" must be an object.');
  } else {
    const m = c.member as Record<string, unknown>;
    if (!isNonEmptyString(m.id)) errors.push("member.id must be a non-empty string.");
    if (!isNonEmptyString(m.name)) errors.push("member.name must be a non-empty string.");
    if (!isNonEmptyString(m.jobRole)) errors.push("member.jobRole must be a non-empty string.");
    if (typeof m.yearsExperience !== "number" || m.yearsExperience < 0) errors.push("member.yearsExperience must be a number >= 0.");
    if (!isNonEmptyString(m.education)) errors.push("member.education must be a non-empty string.");
    if (!isNonEmptyString(m.status)) errors.push("member.status must be a non-empty string (e.g. \"COMPLETED\").");
  }

  if (!Array.isArray(c.missions) || c.missions.length === 0) {
    errors.push('"missions" must be a non-empty array.');
  } else {
    // Cap how many per-item errors we surface — one candidate with 40 broken
    // missions shouldn't produce a 40-line wall of text.
    const MAX_MISSION_ERRORS = 8;
    const before = errors.length;
    c.missions.forEach((m, i) => {
      if (errors.length - before >= MAX_MISSION_ERRORS) return;
      validateMission(m, i, errors);
    });
    const omitted = errors.length - before >= MAX_MISSION_ERRORS;
    if (omitted) errors.push(`...and possibly more mission errors (showing the first ${MAX_MISSION_ERRORS}).`);
  }

  if (!c.signals || typeof c.signals !== "object") {
    errors.push('"signals" must be an object.');
  } else {
    const s = c.signals as Record<string, unknown>;
    if (typeof s.commitDays !== "number" || s.commitDays < 0) errors.push("signals.commitDays must be a number >= 0.");
    if (typeof s.missionsCompleted !== "number" || s.missionsCompleted < 0) errors.push("signals.missionsCompleted must be a number >= 0.");
    if (typeof s.missionsFirstTry !== "number" || s.missionsFirstTry < 0) errors.push("signals.missionsFirstTry must be a number >= 0.");
  }

  if (errors.length > 0) return { valid: false, errors };
  return { valid: true, candidate: x as Candidate };
}
