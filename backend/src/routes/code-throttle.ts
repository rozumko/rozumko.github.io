export const STUDENT_CODE_THROTTLE_SCOPE = 'student-code'
export const SCHOOL_JOIN_CODE_THROTTLE_SCOPE = 'school-join-code'

/**
 * Per-client scopes. The per-code scopes above only slow down an attacker who
 * hammers ONE code: enumerating many different codes gives every guess a fresh
 * bucket, so the failure threshold is never reached. These scopes key on the
 * caller's IP instead, which is what actually caps enumeration.
 *
 * Thresholds are deliberately loose: a whole classroom shares one NAT address,
 * and a well-formed-but-wrong code is a normal typo. Malformed codes are
 * rejected by format validation before they ever reach the throttle.
 */
export const STUDENT_CODE_IP_THROTTLE_SCOPE = 'student-code-ip'
export const SCHOOL_JOIN_CODE_IP_THROTTLE_SCOPE = 'school-join-code-ip'

const DEFAULT_MAX_FAILURES = 5
const DEFAULT_WINDOW_MS = 5 * 60 * 1000
const DEFAULT_COOLDOWN_MS = 2 * 60 * 1000
export const MAX_CODE_THROTTLE_BUCKETS = 50_000

type ThrottleLimits = { maxFailures: number; windowMs: number; cooldownMs: number }

const DEFAULT_LIMITS: ThrottleLimits = {
  maxFailures: DEFAULT_MAX_FAILURES,
  windowMs: DEFAULT_WINDOW_MS,
  cooldownMs: DEFAULT_COOLDOWN_MS,
}

const IP_LIMITS: ThrottleLimits = {
  maxFailures: 20,
  windowMs: 10 * 60 * 1000,
  cooldownMs: 10 * 60 * 1000,
}

/**
 * A whole class joins one game at once, from one NAT address, by copying a
 * 6-digit code off the board — in grades 1-4 the typos arrive in bursts, and a
 * lockout mid-lesson costs the teacher the lesson. The looser ceiling is still
 * far from enumeration: the code space is a million wide and a session's code
 * dies after two hours, so 60 wrong guesses per 10 minutes buys an attacker
 * nothing.
 */
const CLASSROOM_IP_LIMITS: ThrottleLimits = {
  maxFailures: 60,
  windowMs: 10 * 60 * 1000,
  cooldownMs: 5 * 60 * 1000,
}

const SCOPE_LIMITS: Readonly<Record<string, ThrottleLimits>> = {
  [STUDENT_CODE_IP_THROTTLE_SCOPE]: IP_LIMITS,
  [SCHOOL_JOIN_CODE_IP_THROTTLE_SCOPE]: CLASSROOM_IP_LIMITS,
}

function limitsFor(scope: string): ThrottleLimits {
  return SCOPE_LIMITS[scope] ?? DEFAULT_LIMITS
}

function limitsForKey(key: string): ThrottleLimits {
  const separator = key.indexOf(':')
  return separator === -1 ? DEFAULT_LIMITS : limitsFor(key.slice(0, separator))
}

type ThrottleBucket = {
  failures: number
  windowStartedAt: number
  blockedUntil: number
  lastTouchedAt: number
}

const buckets = new Map<string, ThrottleBucket>()

function bucketKey(scope: string, code: string): string {
  return `${scope}:${code}`
}

export function getCodeThrottleStatus(
  scope: string,
  code: string,
  now = Date.now(),
): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  const key = bucketKey(scope, code)
  const bucket = buckets.get(key)
  if (!bucket) return { allowed: true }

  if (bucket.blockedUntil > now) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.blockedUntil - now) / 1000)),
    }
  }

  if (now - bucket.windowStartedAt > limitsFor(scope).windowMs) {
    buckets.delete(key)
  }
  return { allowed: true }
}

function sweepExpiredBuckets(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.blockedUntil > now) continue
    if (now - bucket.windowStartedAt > limitsForKey(key).windowMs) buckets.delete(key)
  }
}

function evictOldestBucket(): void {
  let oldestKey: string | null = null
  let oldestTouchedAt = Number.POSITIVE_INFINITY

  for (const [key, bucket] of buckets) {
    if (bucket.lastTouchedAt < oldestTouchedAt) {
      oldestKey = key
      oldestTouchedAt = bucket.lastTouchedAt
    }
  }

  if (oldestKey) buckets.delete(oldestKey)
}

function ensureBucketCapacity(now: number): void {
  if (buckets.size < MAX_CODE_THROTTLE_BUCKETS) return
  sweepExpiredBuckets(now)
  if (buckets.size >= MAX_CODE_THROTTLE_BUCKETS) evictOldestBucket()
}

export function recordCodeFailure(scope: string, code: string, now = Date.now()): void {
  const key = bucketKey(scope, code)
  const existing = buckets.get(key)

  if (existing?.blockedUntil && existing.blockedUntil > now) return

  const limits = limitsFor(scope)
  const bucket = existing && now - existing.windowStartedAt <= limits.windowMs
    ? existing
    : { failures: 0, windowStartedAt: now, blockedUntil: 0, lastTouchedAt: now }

  bucket.failures += 1
  bucket.lastTouchedAt = now
  if (bucket.failures >= limits.maxFailures) {
    bucket.blockedUntil = now + limits.cooldownMs
    bucket.failures = 0
    bucket.windowStartedAt = now
  }

  if (!existing) ensureBucketCapacity(now)
  buckets.set(key, bucket)
}

export function clearCodeThrottle(scope: string, code: string): void {
  buckets.delete(bucketKey(scope, code))
}

export function resetCodeThrottleForTests(): void {
  buckets.clear()
}

export function getCodeThrottleBucketCountForTests(): number {
  return buckets.size
}
