// Lightweight per-IP rate limiter for POST /api/interview.
//
// The technical spec explicitly requires "no authentication" on this
// endpoint, so real auth is off the table by design — this isn't a
// substitute for it. What it actually protects is the one genuinely scarce
// resource here: a free-tier Groq quota shared across every candidate who
// hits this demo. Without it, one script hammering the endpoint (or an
// accidental client-side retry loop) could burn the whole day's budget in
// seconds. Same globalThis pattern as store.ts, for the same HMR-safety reason.

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 15; // generous for a real conversational pace, tight for a script

type Bucket = { count: number; windowStart: number };

const g = globalThis as unknown as { __rateLimitBuckets?: Map<string, Bucket> };
if (!g.__rateLimitBuckets) g.__rateLimitBuckets = new Map();
const buckets = g.__rateLimitBuckets;

export function checkRateLimit(key: string): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.windowStart >= WINDOW_MS) {
    buckets.set(key, { count: 1, windowStart: now });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (bucket.count >= MAX_REQUESTS_PER_WINDOW) {
    return { allowed: false, retryAfterSeconds: Math.ceil((WINDOW_MS - (now - bucket.windowStart)) / 1000) };
  }
  bucket.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

/** Best-effort client identifier from standard proxy headers. Multiple
 * clients behind the same NAT/proxy will share a bucket — an acceptable
 * trade-off for a hackathon demo with no auth to key off instead. */
export function clientKeyFrom(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
