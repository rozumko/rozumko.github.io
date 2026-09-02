import test from 'node:test'
import assert from 'node:assert/strict'
import {
  clearCodeThrottle,
  getCodeThrottleStatus,
  getCodeThrottleBucketCountForTests,
  MAX_CODE_THROTTLE_BUCKETS,
  recordCodeFailure,
  resetCodeThrottleForTests,
  STUDENT_CODE_THROTTLE_SCOPE,
  STUDENT_CODE_IP_THROTTLE_SCOPE,
  SCHOOL_JOIN_CODE_IP_THROTTLE_SCOPE,
} from './code-throttle.js'

test('code throttle blocks after repeated failures and then cools down', () => {
  resetCodeThrottleForTests()
  const scope = 'test-scope'
  const code = 'ABC123'
  const start = 1_000_000

  for (let i = 0; i < 4; i++) {
    assert.deepEqual(getCodeThrottleStatus(scope, code, start + i), { allowed: true })
    recordCodeFailure(scope, code, start + i)
  }

  assert.deepEqual(getCodeThrottleStatus(scope, code, start + 10), { allowed: true })
  recordCodeFailure(scope, code, start + 10)

  const blocked = getCodeThrottleStatus(scope, code, start + 11)
  assert.equal(blocked.allowed, false)
  assert.equal(blocked.allowed === false && blocked.retryAfterSeconds > 0, true)

  assert.deepEqual(getCodeThrottleStatus(scope, code, start + 2 * 60 * 1000 + 11), { allowed: true })
})

test('code throttle is scoped and can be cleared after a valid code', () => {
  resetCodeThrottleForTests()
  const now = 2_000_000
  for (let i = 0; i < 5; i++) recordCodeFailure('student', 'CODE1', now + i)

  assert.equal(getCodeThrottleStatus('student', 'CODE1', now + 10).allowed, false)
  assert.deepEqual(getCodeThrottleStatus('school', 'CODE1', now + 10), { allowed: true })

  clearCodeThrottle('student', 'CODE1')
  assert.deepEqual(getCodeThrottleStatus('student', 'CODE1', now + 10), { allowed: true })
})

test('code throttle caps buckets and evicts the oldest key', () => {
  resetCodeThrottleForTests()
  const scope = 'cap-test'
  const oldestCode = 'CODE-OLDEST'
  const start = 3_000_000

  for (let i = 0; i < 4; i++) recordCodeFailure(scope, oldestCode, start + i)

  for (let i = 1; i < MAX_CODE_THROTTLE_BUCKETS; i++) {
    recordCodeFailure(scope, `CODE-${i}`, start + 100 + i)
  }

  assert.equal(getCodeThrottleBucketCountForTests(), MAX_CODE_THROTTLE_BUCKETS)
  recordCodeFailure(scope, 'CODE-NEW', start + 200 + MAX_CODE_THROTTLE_BUCKETS)
  assert.equal(getCodeThrottleBucketCountForTests(), MAX_CODE_THROTTLE_BUCKETS)

  recordCodeFailure(scope, oldestCode, start + 300 + MAX_CODE_THROTTLE_BUCKETS)
  assert.deepEqual(getCodeThrottleStatus(scope, oldestCode, start + 301 + MAX_CODE_THROTTLE_BUCKETS), { allowed: true })
})

// The per-code scope only slows down someone hammering a single code. An
// enumerator walking the whole code space gets a brand-new bucket per guess and
// never trips it — that is what the per-IP scope exists to stop.
test('per-code scope does not stop enumeration of many different codes', () => {
  resetCodeThrottleForTests()
  const start = 2_000_000

  for (let i = 0; i < 200; i++) {
    const code = `KIT${String(i).padStart(4, '0')}`
    assert.deepEqual(getCodeThrottleStatus(STUDENT_CODE_THROTTLE_SCOPE, code, start + i), { allowed: true })
    recordCodeFailure(STUDENT_CODE_THROTTLE_SCOPE, code, start + i)
  }
})

test('per-IP scope blocks enumeration after its own threshold', () => {
  resetCodeThrottleForTests()
  const ip = '203.0.113.9'
  const start = 3_000_000

  for (let i = 0; i < 19; i++) {
    assert.deepEqual(getCodeThrottleStatus(STUDENT_CODE_IP_THROTTLE_SCOPE, ip, start + i), { allowed: true })
    recordCodeFailure(STUDENT_CODE_IP_THROTTLE_SCOPE, ip, start + i)
  }

  // 20th failure trips the block.
  assert.deepEqual(getCodeThrottleStatus(STUDENT_CODE_IP_THROTTLE_SCOPE, ip, start + 19), { allowed: true })
  recordCodeFailure(STUDENT_CODE_IP_THROTTLE_SCOPE, ip, start + 19)

  const blocked = getCodeThrottleStatus(STUDENT_CODE_IP_THROTTLE_SCOPE, ip, start + 20)
  assert.equal(blocked.allowed, false)

  // Threshold is looser than the per-code one: a classroom behind one NAT
  // address must not lock itself out on a handful of typos.
  assert.equal(blocked.allowed === false && blocked.retryAfterSeconds > 5 * 60, true)
})

test('per-IP threshold is independent of the per-code threshold', () => {
  resetCodeThrottleForTests()
  const ip = '198.51.100.4'
  const start = 4_000_000

  for (let i = 0; i < 6; i++) recordCodeFailure(STUDENT_CODE_IP_THROTTLE_SCOPE, ip, start + i)

  // Six failures would already have blocked a per-code bucket.
  assert.deepEqual(getCodeThrottleStatus(STUDENT_CODE_IP_THROTTLE_SCOPE, ip, start + 7), { allowed: true })
  recordCodeFailure('some-code-scope', 'ABC123', start)
  for (let i = 1; i < 5; i++) recordCodeFailure('some-code-scope', 'ABC123', start + i)
  assert.equal(getCodeThrottleStatus('some-code-scope', 'ABC123', start + 6).allowed, false)
})

test('classroom join keeps a whole class typing after the olympiad ceiling would block', () => {
  resetCodeThrottleForTests()
  const ip = '192.0.2.77'
  const start = 5_000_000

  // Enough typos to lock the stricter student-code scope out several times over.
  for (let i = 0; i < 59; i++) {
    recordCodeFailure(SCHOOL_JOIN_CODE_IP_THROTTLE_SCOPE, ip, start + i)
  }
  assert.deepEqual(getCodeThrottleStatus(SCHOOL_JOIN_CODE_IP_THROTTLE_SCOPE, ip, start + 59), { allowed: true })

  recordCodeFailure(SCHOOL_JOIN_CODE_IP_THROTTLE_SCOPE, ip, start + 59)
  const blocked = getCodeThrottleStatus(SCHOOL_JOIN_CODE_IP_THROTTLE_SCOPE, ip, start + 60)
  assert.equal(blocked.allowed, false)
  // The cooldown must not swallow a whole lesson.
  assert.equal(blocked.allowed === false && blocked.retryAfterSeconds <= 5 * 60, true)
})
