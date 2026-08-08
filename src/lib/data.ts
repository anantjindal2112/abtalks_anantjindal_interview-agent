import curriculumRaw from "@/data/curriculum.json";
import candidatesRaw from "@/data/candidates.json";
import type { Curriculum, CurriculumDay, Candidate } from "./types";

export const curriculum = curriculumRaw as Curriculum;

// Bundled synthetic candidates, offered as quick-pick options in the UI.
// The API itself accepts any Candidate matching the schema, not just these.
export const sampleCandidates = candidatesRaw.candidates as Candidate[];

const dayLookup = new Map<number, CurriculumDay>(
  curriculum.days.map((d) => [d.day, d])
);

export function getCurriculumDay(day: number): CurriculumDay | null {
  return dayLookup.get(day) ?? null;
}

export function findSampleCandidate(id: string): Candidate | undefined {
  return sampleCandidates.find((c) => c.member.id === id);
}
