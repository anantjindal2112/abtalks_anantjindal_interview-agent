import type { SessionState } from "./types";

// In-memory session store, keyed by sessionId.
//
// Deliberately simple for a hackathon demo: state lives in process memory and
// is lost on server restart. It's stashed on `globalThis` (rather than a plain
// module-level `Map`) so it survives Next.js dev-server hot-module-reloads,
// which would otherwise re-evaluate this module and silently wipe every live
// interview. In a real deployment this would be Redis/a DB instead.
const g = globalThis as unknown as {
  __interviewSessions?: Map<string, SessionState>;
};

if (!g.__interviewSessions) {
  g.__interviewSessions = new Map<string, SessionState>();
}

export const sessions = g.__interviewSessions;

export function getSession(sessionId: string): SessionState | undefined {
  return sessions.get(sessionId);
}

export function saveSession(session: SessionState): void {
  sessions.set(session.sessionId, session);
}

export function deleteSession(sessionId: string): void {
  sessions.delete(sessionId);
}
