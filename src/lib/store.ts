import { Redis } from "@upstash/redis";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { SessionState } from "./types";

// Three-tier session store, in priority order:
//   1. In-memory `globalThis` Map — fast, and survives Next.js dev-server
//      hot-module-reloads (which re-evaluate this module).
//   2. Redis (Upstash REST API), IF credentials are configured — the real
//      fix for Vercel serverless: each request can land on a different
//      function instance with its own memory AND its own /tmp, so anything
//      not in a genuinely shared store can "disappear" mid-interview. Picks
//      up either the native "Vercel KV" env var names (KV_REST_API_URL/
//      TOKEN) or Upstash's own (UPSTASH_REDIS_REST_URL/TOKEN) — whichever a
//      Vercel Marketplace integration injects, zero code change needed.
//      Entirely optional and free-tier: with no credentials set, this tier
//      is simply skipped.
//   3. A JSON file per session on disk — the fallback when Redis isn't
//      configured (e.g. local dev). Real persistence across restarts on a
//      single long-lived process; NOT shared across separate Vercel
//      instances, which is exactly why tier 2 exists.
const g = globalThis as unknown as {
  __interviewSessions?: Map<string, SessionState>;
};

if (!g.__interviewSessions) {
  g.__interviewSessions = new Map<string, SessionState>();
}

export const sessions = g.__interviewSessions;

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = REDIS_URL && REDIS_TOKEN ? new Redis({ url: REDIS_URL, token: REDIS_TOKEN }) : null;

// 6 hours — generous for a demo interview (never takes more than a handful
// of minutes), just bounds unbounded growth in the Redis free tier.
const SESSION_TTL_SECONDS = 60 * 60 * 6;
// How many completed sessions Cohort Insights (/records) keeps around when
// Redis is configured — a demo/BI bonus feature, not a hard limit on
// anything core.
const COMPLETED_LIST_MAX = 200;

function redisKey(sessionId: string): string {
  return `interview-session:${sessionId}`;
}

const COMPLETED_LIST_KEY = "interview-completed-sessions";

// Vercel's serverless functions ship a read-only deployment bundle — only
// os.tmpdir() (/tmp) is writable there, and Vercel always sets VERCEL=1.
// Locally (and on any long-lived Node host), process.cwd() is writable AND
// actually persists across restarts, which is the real point of this tier —
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
// route.ts) — never interpolate it into a path (or a Redis key) without
// sanitizing first.
function filePath(sessionId: string): string {
  const safe = sessionId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 200) || "_";
  return path.join(DATA_DIR, `${safe}.json`);
}

export async function getSession(sessionId: string): Promise<SessionState | undefined> {
  const cached = sessions.get(sessionId);
  if (cached) return cached;

  if (redis) {
    try {
      const remote = await redis.get<SessionState>(redisKey(sessionId));
      if (remote) {
        sessions.set(sessionId, remote);
        return remote;
      }
      // Redis is configured and authoritative once it's up — a real "not
      // found" here means the session genuinely doesn't exist anywhere, so
      // don't fall through to disk (which isn't shared across instances and
      // could give a stale/wrong answer).
      return undefined;
    } catch (err) {
      console.error("[store] Redis read failed, falling back to disk/memory for this request:", err);
      // fall through to disk as a best-effort fallback below
    }
  }

  if (!fsAvailable) return undefined;
  try {
    const raw = fs.readFileSync(filePath(sessionId), "utf8");
    const parsed = JSON.parse(raw) as SessionState;
    sessions.set(sessionId, parsed);
    return parsed;
  } catch {
    // Not found on disk either, or unreadable/corrupt — either way, "no
    // session" is the correct answer.
    return undefined;
  }
}

export async function saveSession(session: SessionState): Promise<void> {
  sessions.set(session.sessionId, session);

  if (redis) {
    try {
      await redis.set(redisKey(session.sessionId), session, { ex: SESSION_TTL_SECONDS });
      // Cross-instance Cohort Insights: index completed sessions in a capped
      // list so /records can see interviews finished on ANY instance, not
      // just whichever one happens to serve that particular GET request.
      // Fire only once — this write only ever runs on a genuine "done"
      // transition since route.ts short-circuits already-concluded sessions
      // before reaching saveSession again.
      if (session.phase === "done") {
        await redis.lpush(COMPLETED_LIST_KEY, session.sessionId);
        await redis.ltrim(COMPLETED_LIST_KEY, 0, COMPLETED_LIST_MAX - 1);
      }
      return; // Redis succeeded — it's the shared source of truth, disk isn't needed too
    } catch (err) {
      console.error("[store] Redis write failed, falling back to disk/memory for this session:", err);
      // fall through to disk as a best-effort fallback below
    }
  }

  if (!fsAvailable || !ensureDir()) return;
  try {
    fs.writeFileSync(filePath(session.sessionId), JSON.stringify(session));
  } catch (err) {
    fsAvailable = false;
    console.error("[store] failed to persist session to disk, continuing in-memory only:", err);
  }
}

/**
 * Every completed interview Cohort Insights (/records) should show. When
 * Redis is configured, reads the shared cross-instance index (real fix —
 * two different serverless instances can each complete an interview and
 * both should show up); otherwise falls back to whatever this single
 * process has seen, same as before — a demo/BI bonus feature staying
 * honestly scoped to what it can actually promise.
 */
export async function getCompletedSessions(): Promise<SessionState[]> {
  if (redis) {
    try {
      const ids = await redis.lrange<string>(COMPLETED_LIST_KEY, 0, COMPLETED_LIST_MAX - 1);
      const fetched = await Promise.all(ids.map((id) => getSession(id)));
      return fetched.filter((s): s is SessionState => !!s);
    } catch (err) {
      console.error("[store] Redis completed-list read failed, falling back to local cache:", err);
    }
  }
  return Array.from(sessions.values()).filter((s) => s.phase === "done" && s.feedback);
}

export async function deleteSession(sessionId: string): Promise<void> {
  sessions.delete(sessionId);
  if (redis) {
    try {
      await redis.del(redisKey(sessionId));
    } catch (err) {
      console.error("[store] Redis delete failed:", err);
    }
  }
  if (!fsAvailable) return;
  try {
    fs.unlinkSync(filePath(sessionId));
  } catch {
    // Nothing on disk to delete, or fs unavailable — either way, done.
  }
}
