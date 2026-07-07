export const STUDENT_CODE_THROTTLE_SCOPE = 'student-code'
export const SCHOOL_JOIN_CODE_THROTTLE_SCOPE = 'school-join-code'

const DEFAULT_MAX_FAILURES = 5
const DEFAULT_WINDOW_MS = 5 * 60 * 1000
const DEFAULT_COOLDOWN_MS = 2 * 60 * 1000

type ThrottleBucket = {
  failures: number
  windowStartedAt: number
  blockedUntil: number
}

const buckets = new Map<string, ThrottleBucket>()

function bucketKey(scope: string, code: string): string {
  return `${scope}:${code}`
}

function getNow(now = Date.now()): number {
  return now
}

export function getCodeThrottleStatus(
  scope: string,
  code: string,
  now = Date.now(),
): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  const key = bucketKey(scope, code)
  const bucket = buckets.get(key)
  if (!bucket) return { allowed: true }

  const current = getNow(now)
  if (bucket.blockedUntil > current) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.blockedUntil - current) / 1000)),
    }
  }

  if (current - bucket.windowStartedAt > DEFAULT_WINDOW_MS) {
    buckets.delete(key)
  }
  return { allowed: true }
}

export function recordCodeFailure(scope: string, code: string, now = Date.now()): void {
  const current = getNow(now)
  const key = bucketKey(scope, code)
  const existing = buckets.get(key)

  if (existing?.blockedUntil && existing.blockedUntil > current) return

  const bucket = existing && current - existing.windowStartedAt <= DEFAULT_WINDOW_MS
    ? existing
    : { failures: 0, windowStartedAt: current, blockedUntil: 0 }

  bucket.failures += 1
  if (bucket.failures >= DEFAULT_MAX_FAILURES) {
    bucket.blockedUntil = current + DEFAULT_COOLDOWN_MS
    bucket.failures = 0
    bucket.windowStartedAt = current
  }
  buckets.set(key, bucket)
}

export function clearCodeThrottle(scope: string, code: string): void {
  buckets.delete(bucketKey(scope, code))
}

export function resetCodeThrottleForTests(): void {
  buckets.clear()
}
