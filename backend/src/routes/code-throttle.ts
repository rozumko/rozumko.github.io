export const STUDENT_CODE_THROTTLE_SCOPE = 'student-code'
export const SCHOOL_JOIN_CODE_THROTTLE_SCOPE = 'school-join-code'

const DEFAULT_MAX_FAILURES = 5
const DEFAULT_WINDOW_MS = 5 * 60 * 1000
const DEFAULT_COOLDOWN_MS = 2 * 60 * 1000
export const MAX_CODE_THROTTLE_BUCKETS = 50_000

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

  if (now - bucket.windowStartedAt > DEFAULT_WINDOW_MS) {
    buckets.delete(key)
  }
  return { allowed: true }
}

function sweepExpiredBuckets(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.blockedUntil > now) continue
    if (now - bucket.windowStartedAt > DEFAULT_WINDOW_MS) buckets.delete(key)
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

  const bucket = existing && now - existing.windowStartedAt <= DEFAULT_WINDOW_MS
    ? existing
    : { failures: 0, windowStartedAt: now, blockedUntil: 0, lastTouchedAt: now }

  bucket.failures += 1
  bucket.lastTouchedAt = now
  if (bucket.failures >= DEFAULT_MAX_FAILURES) {
    bucket.blockedUntil = now + DEFAULT_COOLDOWN_MS
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
