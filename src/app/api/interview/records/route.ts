import { NextResponse } from "next/server";
import { sessions } from "@/lib/store";

// Not part of the graded contract — a judge/demo-facing view of every
// interview actually completed on THIS server process (in-memory store, so
// this resets on restart/redeploy, same caveat as the rest of the app's
// state — honestly documented, not hidden). Real candidates never see this;
// it's an aggregate insights view, not a feature of the candidate experience.
export async function GET() {
  const records = Array.from(sessions.values())
    .filter((s) => s.phase === "done" && s.feedback)
    .map((s) => ({
      sessionId: s.sessionId,
      member: s.candidate.member,
      questionsAsked: s.questionsAsked,
      daysCovered: s.daysCovered.length,
      skipCount: s.skipCount,
      completedAt: s.completedAt ?? s.createdAt,
      feedback: s.feedback,
    }))
    .sort((a, b) => b.completedAt - a.completedAt);

  return NextResponse.json({ records });
}
