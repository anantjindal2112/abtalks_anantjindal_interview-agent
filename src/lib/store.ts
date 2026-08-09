import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { SessionState } from "./types";

// Two-tier session store: an in-memory `globalThis`-backed Map (fast, and
// survives Next.js dev-server hot-module-reloads, which re-evaluate this
// module) BACKED by a JSON file per session under `.sessions/` for real
// persistence across server restarts. Deliberately not a database or Redis —
// this is a free, zero-config, zero-new-dependency upgrade appropriate for a
// hackathon deployment, not a claim of production-grade infra. If the
// filesystem isn't writable (e.g. a read-only serverless runtime), every
// write silently degrades to in-memory-only after the first failure — the
// interview still works, it just loses the durability, exactly the same
// trade-off the old in-memory-only version always had.
const g = globalThis as unknown as {
  __interviewSessions?: Map<string, SessionState>;
};

if (!g.__interviewSessions) {
  g.__interviewSessions = new Map<string, SessionState>();
}

export const sessions = g.__interviewSessions;

// Vercel's serverless functions ship a read-only deployment bundle — only
// os.tmpdir() (/tmp) is writable there, and Vercel always sets VERCEL=1.
// Locally (and on any long-lived Node host), process.cwd() is writable AND
// actually persists across restarts, which is the real point of this store —
// /tmp on most systems doesn't survive a reboot, so it's the fallback, not
// the default.
const DATA_DIR = process.env.VERCEL ? path.join(os.tmpdir(), "interview-agent-sessions") : path.join(process.cwd(), ".sessions");

// Flips false permanently on the first filesystem failure so we stop
// retrying pointless disk I/O on every subsequent request in that process.
let fsAvailable = true;

function ensureDir(): boolean {
  if (!fsAvailable) return false;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    return true;
  } catch (err) {
    fsAvailable = false;
    console.error("[store] filesystem persistence unavailable, continuing in-memory only:", err);
    return false;
  }
}

// sessionId is client-controlled (truncated to 200 chars upstream in
// route.ts) — never interpolate it into a path without sanitizing first.
function filePath(sessionId: string): string {
  const safe = sessionId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 200) || "_";
  return path.join(DATA_DIR, `${safe}.json`);
}

export function getSession(sessionId: string): SessionState | undefined {
  const cached = sessions.get(sessionId);
  if (cached) return cached;
  if (!fsAvailable) return undefined;
  try {
    const raw = fs.readFileSync(filePath(sessionId), "utf8");
    const parsed = JSON.parse(raw) as SessionState;
    sessions.set(sessionId, parsed);
    return parsed;
  } catch {
    // Not found on disk either, or unreadable/corrupt — either way, "no
    // session" is the correct answer, same as the old in-memory-only store.
    return undefined;
  }
}

export function saveSession(session: SessionState): void {
  sessions.set(session.sessionId, session);
  if (!fsAvailable || !ensureDir()) return;
  try {
    fs.writeFileSync(filePath(session.sessionId), JSON.stringify(session));
  } catch (err) {
    fsAvailable = false;
    console.error("[store] failed to persist session to disk, continuing in-memory only:", err);
  }
}

export function deleteSession(sessionId: string): void {
  sessions.delete(sessionId);
  if (!fsAvailable) return;
  try {
    fs.unlinkSync(filePath(sessionId));
  } catch {
    // Nothing on disk to delete, or fs unavailable — either way, done.
  }
}
