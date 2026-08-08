import { curriculum, getCurriculumDay } from "./data";
import type { Candidate, Mission, MissionBucket, PlanTopic } from "./types";

// We aim for more anchor topics than the spec's bare minimum (>=4 distinct
// days) so that even if a topic dies early (one-line answer, LLM decides no
// follow-up is warranted) we still comfortably clear >=8 questions / >=4 days.
const TARGET_ANCHORS = 6;
const MIN_DISTINCT_DAYS = 5;

// Randomized per-topic framing so the same topic (even for the same
// candidate run twice) doesn't get asked the same way every time. Picked
// once when the plan is built and handed to the LLM as a suggested angle,
// not a script — it still reacts to the actual conversation.
const QUESTION_ANGLES = [
  "a specific implementation trade-off they had to make",
  "a failure mode or edge case they likely hit while building this",
  "why they chose this tool/approach over an obvious alternative",
  "how they'd explain the core idea to a junior teammate in one breath",
  "what part of it was hardest to get working correctly",
  "how they validated it actually worked, not just that it ran",
  "how this piece connects to the rest of their overall system",
  "a decision they'd make differently if starting over",
];

function pickAngle(): string {
  return QUESTION_ANGLES[Math.floor(Math.random() * QUESTION_ANGLES.length)];
}

export function bucketMission(m: Mission): MissionBucket {
  if (m.skipped) return "skipped";
  if (m.passed === false) return "failed";
  // passed === true, or a mission record with neither flag set (treat as passed)
  return (m.attempts ?? 1) >= 3 ? "struggled" : "confident";
}

function reasonFor(bucket: MissionBucket, title: string, attempts?: number): string {
  switch (bucket) {
    case "confident":
      return `Passed "${title}" on the first attempt — good opener to establish baseline understanding.`;
    case "struggled":
      return `Passed "${title}" but needed ${attempts ?? "several"} attempts — worth probing what was hard and whether they can now explain it cleanly.`;
    case "failed":
      return `Did not pass "${title}" (${attempts ?? "multiple"} attempts) — check whether the conceptual gap is still there.`;
    case "skipped":
      return `Skipped "${title}" entirely — check whether they picked up the concept elsewhere or have a genuine blind spot.`;
  }
}

type Bucketed = { mission: Mission; bucket: MissionBucket };

function toPlanTopic(item: Bucketed, reasonOverride?: string): PlanTopic {
  const curriculumDay = getCurriculumDay(item.mission.day);
  const title = curriculumDay?.title ?? item.mission.title;
  return {
    day: item.mission.day,
    title,
    bucket: item.bucket,
    mission: item.mission,
    curriculumDay,
    reason: reasonOverride ?? reasonFor(item.bucket, title, item.mission.attempts),
    angle: pickAngle(),
  };
}

/** Quick per-bucket counts, used by the candidate picker card UI. */
export function summarizeCandidate(candidate: Candidate) {
  const counts = { confident: 0, struggled: 0, failed: 0, skipped: 0 };
  for (const m of candidate.missions ?? []) counts[bucketMission(m)]++;
  return counts;
}

/**
 * Builds a deterministic, personalized interview plan from a candidate's
 * actual mission history. LLM discretion drives per-turn follow-ups; which
 * *topics* get asked about at all is decided here so the interview is always
 * grounded in what the candidate really did (or didn't do).
 */
export function buildInterviewPlan(candidate: Candidate): PlanTopic[] {
  const missions = [...(candidate.missions ?? [])].sort((a, b) => a.day - b.day);
  const bucketed: Bucketed[] = missions.map((mission) => ({
    mission,
    bucket: bucketMission(mission),
  }));

  const byBucket = {
    confident: bucketed.filter((b) => b.bucket === "confident"),
    struggled: bucketed.filter((b) => b.bucket === "struggled"),
    failed: bucketed.filter((b) => b.bucket === "failed"),
    skipped: bucketed.filter((b) => b.bucket === "skipped"),
  };

  const picked: Bucketed[] = [];
  const usedDays = new Set<number>();
  const take = (item: Bucketed) => {
    picked.push(item);
    usedDays.add(item.mission.day);
  };

  // 1. Warm-up: their most confident pass (fewest attempts), or the closest
  // thing to it if they have no clean passes at all.
  const warmupPool = byBucket.confident.length
    ? byBucket.confident
    : byBucket.struggled.length
      ? byBucket.struggled
      : bucketed;
  const warmup = [...warmupPool].sort(
    (a, b) => (a.mission.attempts ?? 1) - (b.mission.attempts ?? 1)
  )[0];
  if (warmup) take(warmup);

  // 2. Closer: their capstone if they have one, else their highest-day mission.
  const capstone =
    bucketed.find((b) => getCurriculumDay(b.mission.day)?.type === "CAPSTONE" && !usedDays.has(b.mission.day)) ??
    [...bucketed].filter((b) => !usedDays.has(b.mission.day)).sort((a, b) => b.mission.day - a.mission.day)[0];

  // 3. Core: the richest material — struggled/failed/skipped days — ordered
  // chronologically so the interview reads as a walk through their journey.
  const richPool = [...byBucket.failed, ...byBucket.struggled, ...byBucket.skipped]
    .filter((b) => !usedDays.has(b.mission.day) && b.mission.day !== capstone?.mission.day)
    .sort((a, b) => a.mission.day - b.mission.day);

  for (const item of richPool) {
    if (picked.length >= TARGET_ANCHORS - (capstone ? 1 : 0)) break;
    if (usedDays.has(item.mission.day)) continue;
    take(item);
  }

  // 4. Still short of the target? Backfill with remaining confident days.
  if (picked.length < TARGET_ANCHORS - (capstone ? 1 : 0)) {
    const fillerPool = byBucket.confident
      .filter((b) => !usedDays.has(b.mission.day) && b.mission.day !== capstone?.mission.day)
      .sort((a, b) => a.mission.day - b.mission.day);
    for (const item of fillerPool) {
      if (picked.length >= TARGET_ANCHORS - (capstone ? 1 : 0)) break;
      take(item);
    }
  }

  if (capstone && !usedDays.has(capstone.mission.day)) take(capstone);

  // 5. Edge case: candidate record is thin enough that we still don't have
  // enough distinct days. Pad with curriculum days they have no mission
  // record for at all, testing baseline knowledge instead of their own work.
  if (usedDays.size < MIN_DISTINCT_DAYS) {
    for (const day of curriculum.days) {
      if (usedDays.size >= MIN_DISTINCT_DAYS) break;
      if (usedDays.has(day.day)) continue;
      usedDays.add(day.day);
      picked.push({
        mission: { day: day.day, title: day.title },
        bucket: "skipped",
      });
    }
  }

  // Reorder: warm-up first, middle sorted chronologically, capstone/closer last.
  const warmupTopic = picked[0];
  const closerTopic = capstone
    ? picked.find((p) => p.mission.day === capstone.mission.day)
    : picked[picked.length - 1];
  const middle = picked
    .filter((p) => p !== warmupTopic && p !== closerTopic)
    .sort((a, b) => a.mission.day - b.mission.day);

  const ordered = [warmupTopic, ...middle, closerTopic].filter(
    (x, i, arr): x is Bucketed => !!x && arr.indexOf(x) === i
  );

  return ordered.map((item, i) => {
    if (i === 0) {
      return toPlanTopic(
        item,
        `Warm-up — passed "${getCurriculumDay(item.mission.day)?.title ?? item.mission.title}" cleanly; open here to build rapport and confirm baseline fluency.`
      );
    }
    if (i === ordered.length - 1 && item === closerTopic) {
      return toPlanTopic(
        item,
        `Closing question — synthesize "${getCurriculumDay(item.mission.day)?.title ?? item.mission.title}", their most advanced/integrative work, end-to-end.`
      );
    }
    return toPlanTopic(item);
  });
}
